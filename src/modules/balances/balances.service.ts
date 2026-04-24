import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { Employee } from '../../entities/employee.entity';
import { Location } from '../../entities/location.entity';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { ErrorCode } from '../../common/error-codes.enum';

export interface BalanceDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
  availableUnits: number;
  pendingUnits: number;
  lastHcmSnapshotAt?: Date;
  version: number;
}

export interface SyncResult {
  success: boolean;
  updated: number;
  errors?: string[];
}

@Injectable()
export class BalancesService {
  constructor(
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepo: Repository<LeaveBalance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly hcmIntegration: HcmIntegrationService,
  ) {}

  async getBalance(employeeId: string, locationId?: string, leaveType?: string): Promise<BalanceDto[]> {
    const employee = await this.employeeRepo.findOne({ where: { externalHcmEmployeeId: employeeId } });
    if (!employee) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Employee not found' });
    }

    const qb = this.leaveBalanceRepo.createQueryBuilder('lb')
      .where('lb.employeeId = :employeeId', { employeeId: employee.id });

    if (locationId) {
      const location = await this.locationRepo.findOne({ where: { externalHcmLocationId: locationId } });
      if (location) {
        qb.andWhere('lb.locationId = :locId', { locId: location.id });
      }
    }

    if (leaveType) {
      qb.andWhere('lb.leaveType = :leaveType', { leaveType });
    }

    const balances = await qb.getMany();
    return balances.map((b) => this.mapToDto(b, employeeId, locationId));
  }

  async getOrCreateBalance(employeeId: string, locationId: string, leaveType: string): Promise<LeaveBalance> {
    const employee = await this.employeeRepo.findOne({ where: { externalHcmEmployeeId: employeeId } });
    const location = await this.locationRepo.findOne({ where: { externalHcmLocationId: locationId } });
    if (!employee || !location) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Employee or location not found' });
    }

    let balance = await this.leaveBalanceRepo.findOne({
      where: { employeeId: employee.id, locationId: location.id, leaveType },
    });

    if (!balance) {
      const hcmResult = await this.hcmIntegration.validateTimeOff(employeeId, locationId, leaveType, 0);
      const availableUnits = hcmResult.response.valid && hcmResult.response.remainingBalance !== undefined
        ? hcmResult.response.remainingBalance
        : 0;

      balance = this.leaveBalanceRepo.create({
        employeeId: employee.id,
        locationId: location.id,
        leaveType,
        availableUnits,
        pendingUnits: 0,
        lastHcmSnapshotAt: new Date(),
      });
      await this.leaveBalanceRepo.save(balance);
    }

    return balance;
  }

  async syncRealtime(employeeId: string, locationId: string, leaveType: string): Promise<BalanceDto> {
    const balance = await this.getOrCreateBalance(employeeId, locationId, leaveType);

    const { response, event } = await this.hcmIntegration.validateTimeOff(employeeId, locationId, leaveType, 0);

    if (response.valid && response.remainingBalance !== undefined) {
      balance.availableUnits = response.remainingBalance;
      balance.lastHcmSnapshotAt = new Date();
      await this.leaveBalanceRepo.save(balance);
    }

    return this.mapToDto(balance, employeeId, locationId);
  }

  async syncBatch(): Promise<SyncResult> {
    const { balances: hcmBalances, event } = await this.hcmIntegration.fetchBatchBalances();
    let updated = 0;
    const errors: string[] = [];

    for (const hcm of hcmBalances) {
      try {
        const employee = await this.employeeRepo.findOne({ where: { externalHcmEmployeeId: hcm.employeeId } });
        const location = await this.locationRepo.findOne({ where: { externalHcmLocationId: hcm.locationId } });
        if (!employee || !location) {
          errors.push(`Missing local employee/location for ${hcm.employeeId}/${hcm.locationId}`);
          continue;
        }

        let balance = await this.leaveBalanceRepo.findOne({
          where: { employeeId: employee.id, locationId: location.id, leaveType: hcm.leaveType },
        });

        if (!balance) {
          balance = this.leaveBalanceRepo.create({
            employeeId: employee.id,
            locationId: location.id,
            leaveType: hcm.leaveType,
            availableUnits: hcm.availableUnits,
            pendingUnits: 0,
            lastHcmSnapshotAt: new Date(),
          });
        } else {
          balance.availableUnits = hcm.availableUnits;
          balance.lastHcmSnapshotAt = new Date();
        }

        await this.leaveBalanceRepo.save(balance);
        updated++;
      } catch (e) {
        errors.push(`Failed to update ${hcm.employeeId}/${hcm.locationId}/${hcm.leaveType}: ${e.message}`);
      }
    }

    return { success: event.status !== 'FAILED', updated, errors };
  }

  async reconcile(): Promise<{ scanned: number; drift: number; corrected: number }> {
    const localBalances = await this.leaveBalanceRepo.find();
    let drift = 0;
    let corrected = 0;

    for (const local of localBalances) {
      const employee = await this.employeeRepo.findOne({ where: { id: local.employeeId } });
      const location = await this.locationRepo.findOne({ where: { id: local.locationId } });
      if (!employee || !location) continue;

      const hcmBalance = await this.hcmIntegration.validateTimeOff(
        employee.externalHcmEmployeeId,
        location.externalHcmLocationId,
        local.leaveType,
        0,
      );

      if (hcmBalance.response.valid && hcmBalance.response.remainingBalance !== undefined) {
        if (Number(local.availableUnits) !== Number(hcmBalance.response.remainingBalance)) {
          drift++;
          local.availableUnits = hcmBalance.response.remainingBalance;
          local.lastHcmSnapshotAt = new Date();
          await this.leaveBalanceRepo.save(local);
          corrected++;
        }
      }
    }

    return { scanned: localBalances.length, drift, corrected };
  }

  async adjustPendingUnits(employeeId: string, locationId: string, leaveType: string, delta: number): Promise<void> {
    const balance = await this.getOrCreateBalance(employeeId, locationId, leaveType);
    const newPending = Number(balance.pendingUnits) + delta;
    if (newPending < 0) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Pending units cannot go negative' });
    }
    balance.pendingUnits = newPending;
    await this.leaveBalanceRepo.save(balance);
  }

  async commitDeduction(employeeId: string, locationId: string, leaveType: string, units: number): Promise<void> {
    const balance = await this.getOrCreateBalance(employeeId, locationId, leaveType);
    const newAvailable = Number(balance.availableUnits) - units;
    const newPending = Number(balance.pendingUnits) - units;
    if (newAvailable < 0) {
      throw new BadRequestException({ code: ErrorCode.INSUFFICIENT_BALANCE, message: 'Insufficient balance after deduction' });
    }
    if (newPending < 0) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Pending units cannot go negative' });
    }
    balance.availableUnits = newAvailable;
    balance.pendingUnits = newPending;
    await this.leaveBalanceRepo.save(balance);
  }

  private mapToDto(balance: LeaveBalance, employeeExternalId?: string, locationExternalId?: string): BalanceDto {
    return {
      employeeId: employeeExternalId || balance.employeeId,
      locationId: locationExternalId || balance.locationId,
      leaveType: balance.leaveType,
      availableUnits: Number(balance.availableUnits),
      pendingUnits: Number(balance.pendingUnits),
      lastHcmSnapshotAt: balance.lastHcmSnapshotAt,
      version: balance.version,
    };
  }
}
