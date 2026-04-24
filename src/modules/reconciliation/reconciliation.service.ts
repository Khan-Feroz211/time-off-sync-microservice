import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReconciliationRun, ReconciliationStatus } from '../../entities/reconciliation-run.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { Employee } from '../../entities/employee.entity';
import { Location } from '../../entities/location.entity';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(ReconciliationRun)
    private readonly reconciliationRepo: Repository<ReconciliationRun>,
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepo: Repository<LeaveBalance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly hcmIntegration: HcmIntegrationService,
  ) {}

  async runReconciliation(): Promise<ReconciliationRun> {
    const run = this.reconciliationRepo.create({ status: ReconciliationStatus.RUNNING });
    await this.reconciliationRepo.save(run);

    try {
      const localBalances = await this.leaveBalanceRepo.find();
      let driftCount = 0;
      const actionSummary: string[] = [];

      for (const local of localBalances) {
        const employee = await this.employeeRepo.findOne({ where: { id: local.employeeId } });
        const location = await this.locationRepo.findOne({ where: { id: local.locationId } });
        if (!employee || !location) {
          actionSummary.push(`SKIP: missing employee or location for balance ${local.id}`);
          continue;
        }

        const hcmResult = await this.hcmIntegration.validateTimeOff(
          employee.externalHcmEmployeeId,
          location.externalHcmLocationId,
          local.leaveType,
          0,
        );

        if (!hcmResult.response.valid) {
          actionSummary.push(`FAIL: HCM error for ${employee.externalHcmEmployeeId}/${local.leaveType}: ${hcmResult.response.errorMessage}`);
          continue;
        }

        const hcmBalance = hcmResult.response.remainingBalance ?? 0;
        const localBalance = Number(local.availableUnits);

        if (Math.abs(localBalance - hcmBalance) > 0.001) {
          driftCount++;
          actionSummary.push(
            `CORRECT: ${employee.externalHcmEmployeeId}/${location.externalHcmLocationId}/${local.leaveType} ` +
            `local=${localBalance} hcm=${hcmBalance}`,
          );
          local.availableUnits = hcmBalance;
          local.lastHcmSnapshotAt = new Date();
          await this.leaveBalanceRepo.save(local);
        }
      }

      run.status = ReconciliationStatus.COMPLETED;
      run.completedAt = new Date();
      run.recordsScanned = localBalances.length;
      run.driftCount = driftCount;
      run.actionSummary = actionSummary.join('\n');
    } catch (error) {
      this.logger.error(`Reconciliation failed: ${error.message}`);
      run.status = ReconciliationStatus.FAILED;
      run.completedAt = new Date();
      run.actionSummary = error.message;
    }

    await this.reconciliationRepo.save(run);
    return run;
  }

  async getRuns(): Promise<ReconciliationRun[]> {
    return this.reconciliationRepo.find({ order: { startedAt: 'DESC' } });
  }
}
