import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TimeOffRequest, RequestStatus } from '../../entities/time-off-request.entity';
import { SyncEvent, SyncDirection, SyncEventType, SyncStatus } from '../../entities/sync-event.entity';
import { Employee } from '../../entities/employee.entity';
import { Location } from '../../entities/location.entity';
import { BalancesService } from '../balances/balances.service';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { ErrorCode } from '../../common/error-codes.enum';

export interface CreateRequestDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
  units: number;
  startDate: string;
  endDate: string;
}

export interface RequestResponseDto {
  id: string;
  employeeId: string;
  locationId: string;
  leaveType: string;
  units: number;
  startDate: Date;
  endDate: Date;
  status: RequestStatus;
  managerId?: string | null;
  hcmReference?: string | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.DRAFT]: [RequestStatus.SUBMITTED],
  [RequestStatus.SUBMITTED]: [RequestStatus.PENDING_MANAGER_APPROVAL, RequestStatus.REJECTED],
  [RequestStatus.PENDING_MANAGER_APPROVAL]: [RequestStatus.APPROVED, RequestStatus.REJECTED],
  [RequestStatus.APPROVED]: [RequestStatus.SYNCED, RequestStatus.SYNC_FAILED, RequestStatus.RETRYING],
  [RequestStatus.REJECTED]: [],
  [RequestStatus.SYNCED]: [],
  [RequestStatus.SYNC_FAILED]: [RequestStatus.RETRYING, RequestStatus.MANUAL_REVIEW],
  [RequestStatus.RETRYING]: [RequestStatus.SYNCED, RequestStatus.SYNC_FAILED, RequestStatus.MANUAL_REVIEW],
  [RequestStatus.MANUAL_REVIEW]: [RequestStatus.SYNCED, RequestStatus.REJECTED],
};

@Injectable()
export class TimeOffRequestsService {
  private readonly logger = new Logger(TimeOffRequestsService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(SyncEvent)
    private readonly syncEventRepo: Repository<SyncEvent>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly balancesService: BalancesService,
    private readonly hcmIntegration: HcmIntegrationService,
    private readonly dataSource: DataSource,
  ) {}

  async createRequest(dto: CreateRequestDto): Promise<RequestResponseDto> {
    if (!dto.employeeId || !dto.locationId || !dto.leaveType || dto.units === undefined || !dto.startDate || !dto.endDate) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Missing required fields' });
    }

    if (dto.units <= 0) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Units must be positive' });
    }

    const employee = await this.employeeRepo.findOne({ where: { externalHcmEmployeeId: dto.employeeId } });
    const location = await this.locationRepo.findOne({ where: { externalHcmLocationId: dto.locationId } });
    if (!employee || !location) {
      throw new BadRequestException({ code: ErrorCode.INVALID_DIMENSION_COMBINATION, message: 'Invalid employee or location' });
    }

    const balance = await this.balancesService.getOrCreateBalance(dto.employeeId, dto.locationId, dto.leaveType);
    const available = Number(balance.availableUnits) - Number(balance.pendingUnits);
    if (available < dto.units) {
      throw new BadRequestException({
        code: ErrorCode.INSUFFICIENT_BALANCE,
        message: `Insufficient balance: available ${available}, requested ${dto.units}`,
      });
    }

    const hcmResult = await this.hcmIntegration.validateTimeOff(dto.employeeId, dto.locationId, dto.leaveType, dto.units);
    await this.persistSyncEvent(hcmResult.event);

    if (!hcmResult.response.valid) {
      throw new BadRequestException({
        code: hcmResult.response.errorCode as ErrorCode || ErrorCode.HCM_UNAVAILABLE,
        message: hcmResult.response.errorMessage || 'HCM validation failed',
      });
    }

    const request = this.requestRepo.create({
      employeeId: employee.id,
      locationId: location.id,
      leaveType: dto.leaveType,
      units: dto.units,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
    });

    await this.balancesService.adjustPendingUnits(dto.employeeId, dto.locationId, dto.leaveType, dto.units);

    const saved = await this.requestRepo.save(request);
    return this.mapToDto(saved, dto.employeeId, dto.locationId);
  }

  async getRequest(id: string): Promise<RequestResponseDto> {
    const request = await this.requestRepo.findOne({ where: { id }, relations: ['employee', 'location'] });
    if (!request) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Request not found' });
    }
    return this.mapToDto(request, request.employee?.externalHcmEmployeeId, request.location?.externalHcmLocationId);
  }

  async listRequests(employeeId?: string, status?: RequestStatus): Promise<RequestResponseDto[]> {
    const qb = this.requestRepo.createQueryBuilder('tor')
      .leftJoinAndSelect('tor.employee', 'e')
      .leftJoinAndSelect('tor.location', 'l');

    if (employeeId) {
      qb.andWhere('e.externalHcmEmployeeId = :empId', { empId: employeeId });
    }

    if (status) {
      qb.andWhere('tor.status = :status', { status });
    }

    const requests = await qb.getMany();
    return requests.map((r) => this.mapToDto(r, r.employee?.externalHcmEmployeeId, r.location?.externalHcmLocationId));
  }

  async approveRequest(id: string, managerId?: string): Promise<RequestResponseDto> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Request not found' });
    }

    const employee = await this.employeeRepo.findOne({ where: { id: request.employeeId } });
    const location = await this.locationRepo.findOne({ where: { id: request.locationId } });
    if (!employee || !location) {
      throw new BadRequestException({ code: ErrorCode.INVALID_DIMENSION_COMBINATION, message: 'Request employee or location not found' });
    }

    this.assertTransition(request.status, RequestStatus.APPROVED);

    const empId = employee.externalHcmEmployeeId;
    const locId = location.externalHcmLocationId;

    const hcmResult = await this.hcmIntegration.validateTimeOff(empId, locId, request.leaveType, Number(request.units));
    await this.persistSyncEvent(hcmResult.event, request.id);

    if (!hcmResult.response.valid) {
      request.status = RequestStatus.SYNC_FAILED;
      request.failureReason = hcmResult.response.errorMessage || 'HCM validation failed on approval';
      await this.requestRepo.save(request);
      throw new BadRequestException({
        code: hcmResult.response.errorCode as ErrorCode || ErrorCode.HCM_UNAVAILABLE,
        message: request.failureReason,
      });
    }

    request.status = RequestStatus.APPROVED;
    request.managerId = managerId || request.managerId;
    await this.requestRepo.save(request);

    const syncResult = await this.hcmIntegration.applyTimeOff(empId, locId, request.leaveType, Number(request.units));
    await this.persistSyncEvent(syncResult.event, request.id);

    if (syncResult.response.success) {
      request.status = RequestStatus.SYNCED;
      request.hcmReference = `hcm-${Date.now()}`;
      await this.balancesService.commitDeduction(empId, locId, request.leaveType, Number(request.units));
    } else {
      request.status = RequestStatus.SYNC_FAILED;
      request.failureReason = syncResult.response.errorMessage || 'HCM apply failed';
    }

    const saved = await this.requestRepo.save(request);
    return this.mapToDto(saved, empId, locId);
  }

  async rejectRequest(id: string, managerId?: string): Promise<RequestResponseDto> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Request not found' });
    }

    const employee = await this.employeeRepo.findOne({ where: { id: request.employeeId } });
    const location = await this.locationRepo.findOne({ where: { id: request.locationId } });
    if (!employee || !location) {
      throw new BadRequestException({ code: ErrorCode.INVALID_DIMENSION_COMBINATION, message: 'Request employee or location not found' });
    }

    this.assertTransition(request.status, RequestStatus.REJECTED);

    request.status = RequestStatus.REJECTED;
    request.managerId = managerId || request.managerId;
    await this.requestRepo.save(request);

    await this.balancesService.adjustPendingUnits(
      employee.externalHcmEmployeeId,
      location.externalHcmLocationId,
      request.leaveType,
      -Number(request.units),
    );

    const saved = await this.requestRepo.save(request);
    return this.mapToDto(saved, employee.externalHcmEmployeeId, location.externalHcmLocationId);
  }

  async retrySync(id: string): Promise<RequestResponseDto> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Request not found' });
    }

    if (request.status !== RequestStatus.SYNC_FAILED && request.status !== RequestStatus.RETRYING) {
      throw new BadRequestException({
        code: ErrorCode.SYNC_CONFLICT,
        message: 'Only SYNC_FAILED or RETRYING requests can be retried',
      });
    }

    const employee = await this.employeeRepo.findOne({ where: { id: request.employeeId } });
    const location = await this.locationRepo.findOne({ where: { id: request.locationId } });
    if (!employee || !location) {
      throw new BadRequestException({ code: ErrorCode.INVALID_DIMENSION_COMBINATION, message: 'Request employee or location not found' });
    }

    request.status = RequestStatus.RETRYING;
    await this.requestRepo.save(request);

    const empId = employee.externalHcmEmployeeId;
    const locId = location.externalHcmLocationId;

    const hcmResult = await this.hcmIntegration.validateTimeOff(empId, locId, request.leaveType, Number(request.units));
    await this.persistSyncEvent(hcmResult.event, request.id);

    if (!hcmResult.response.valid) {
      request.status = RequestStatus.SYNC_FAILED;
      request.failureReason = hcmResult.response.errorMessage || 'HCM validation failed on retry';
      const saved = await this.requestRepo.save(request);
      return this.mapToDto(saved, empId, locId);
    }

    const syncResult = await this.hcmIntegration.applyTimeOff(empId, locId, request.leaveType, Number(request.units));
    await this.persistSyncEvent(syncResult.event, request.id);

    if (syncResult.response.success) {
      request.status = RequestStatus.SYNCED;
      request.hcmReference = `hcm-${Date.now()}`;
      request.failureReason = null;
      await this.balancesService.commitDeduction(empId, locId, request.leaveType, Number(request.units));
    } else {
      request.status = RequestStatus.SYNC_FAILED;
      request.failureReason = syncResult.response.errorMessage || 'HCM apply failed on retry';
    }

    const saved = await this.requestRepo.save(request);
    return this.mapToDto(saved, empId, locId);
  }

  async getSyncEvents(requestId?: string, status?: SyncStatus): Promise<SyncEvent[]> {
    const qb = this.syncEventRepo.createQueryBuilder('se');
    if (requestId) {
      qb.andWhere('se.requestId = :rid', { rid: requestId });
    }
    if (status) {
      qb.andWhere('se.status = :status', { status });
    }
    qb.orderBy('se.createdAt', 'DESC');
    return qb.getMany();
  }

  private assertTransition(current: RequestStatus, next: RequestStatus): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_STATUS_TRANSITION,
        message: `Cannot transition from ${current} to ${next}`,
      });
    }
  }

  private async persistSyncEvent(event: Partial<SyncEvent>, requestId?: string): Promise<void> {
    const toSave = this.syncEventRepo.create({ ...event, requestId });
    await this.syncEventRepo.save(toSave);
  }

  private mapToDto(request: TimeOffRequest, employeeId?: string, locationId?: string): RequestResponseDto {
    return {
      id: request.id,
      employeeId: employeeId || request.employeeId,
      locationId: locationId || request.locationId,
      leaveType: request.leaveType,
      units: Number(request.units),
      startDate: request.startDate,
      endDate: request.endDate,
      status: request.status,
      managerId: request.managerId,
      hcmReference: request.hcmReference,
      failureReason: request.failureReason,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
