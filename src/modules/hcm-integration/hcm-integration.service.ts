import { Injectable, Logger } from '@nestjs/common';
import { MockHcmService, MockHcmBalance } from '../mock-hcm/mock-hcm.service';
import { SyncEvent, SyncDirection, SyncEventType, SyncStatus } from '../../entities/sync-event.entity';

export interface HcmValidationResponse {
  valid: boolean;
  remainingBalance?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface HcmApplyResponse {
  success: boolean;
  remainingBalance?: number;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class HcmIntegrationService {
  private readonly logger = new Logger(HcmIntegrationService.name);

  constructor(private readonly mockHcmService: MockHcmService) {}

  async validateTimeOff(
    employeeId: string,
    locationId: string,
    leaveType: string,
    units: number,
  ): Promise<{ response: HcmValidationResponse; event: Partial<SyncEvent> }> {
    try {
      const result = await this.mockHcmService.validateTimeOff(employeeId, locationId, leaveType, units);
      const event: Partial<SyncEvent> = {
        direction: SyncDirection.OUTBOUND,
        eventType: SyncEventType.REALTIME_VALIDATE,
        status: result.valid ? SyncStatus.SUCCESS : SyncStatus.FAILED,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      };
      return {
        response: {
          valid: result.valid,
          remainingBalance: result.remainingBalance,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
        event,
      };
    } catch (error) {
      this.logger.error(`HCM validate failed: ${error.message}`);
      const event: Partial<SyncEvent> = {
        direction: SyncDirection.OUTBOUND,
        eventType: SyncEventType.REALTIME_VALIDATE,
        status: SyncStatus.FAILED,
        errorCode: 'HCM_UNAVAILABLE',
        errorMessage: error.message,
      };
      return {
        response: {
          valid: false,
          errorCode: 'HCM_UNAVAILABLE',
          errorMessage: error.message,
        },
        event,
      };
    }
  }

  async applyTimeOff(
    employeeId: string,
    locationId: string,
    leaveType: string,
    units: number,
  ): Promise<{ response: HcmApplyResponse; event: Partial<SyncEvent> }> {
    try {
      const result = await this.mockHcmService.applyTimeOff(employeeId, locationId, leaveType, units);
      const event: Partial<SyncEvent> = {
        direction: SyncDirection.OUTBOUND,
        eventType: SyncEventType.REALTIME_APPLY,
        status: result.valid ? SyncStatus.SUCCESS : SyncStatus.FAILED,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      };
      return {
        response: {
          success: result.valid,
          remainingBalance: result.remainingBalance,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
        event,
      };
    } catch (error) {
      this.logger.error(`HCM apply failed: ${error.message}`);
      const event: Partial<SyncEvent> = {
        direction: SyncDirection.OUTBOUND,
        eventType: SyncEventType.REALTIME_APPLY,
        status: SyncStatus.FAILED,
        errorCode: 'HCM_UNAVAILABLE',
        errorMessage: error.message,
      };
      return {
        response: {
          success: false,
          errorCode: 'HCM_UNAVAILABLE',
          errorMessage: error.message,
        },
        event,
      };
    }
  }

  async fetchBatchBalances(): Promise<{ balances: MockHcmBalance[]; event: Partial<SyncEvent> }> {
    try {
      const balances = this.mockHcmService.simulateBatchExport();
      const event: Partial<SyncEvent> = {
        direction: SyncDirection.INBOUND,
        eventType: SyncEventType.BATCH_IMPORT,
        status: SyncStatus.SUCCESS,
      };
      return { balances, event };
    } catch (error) {
      this.logger.error(`HCM batch fetch failed: ${error.message}`);
      const event: Partial<SyncEvent> = {
        direction: SyncDirection.INBOUND,
        eventType: SyncEventType.BATCH_IMPORT,
        status: SyncStatus.FAILED,
        errorCode: 'HCM_UNAVAILABLE',
        errorMessage: error.message,
      };
      return { balances: [], event };
    }
  }
}
