import { Injectable } from '@nestjs/common';

export interface MockHcmBalance {
  employeeId: string;
  locationId: string;
  leaveType: string;
  availableUnits: number;
}

export interface MockHcmValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  remainingBalance?: number;
}

@Injectable()
export class MockHcmService {
  private readonly balances: Map<string, MockHcmBalance> = new Map();
  private failureRate = 0;
  private failureType: '5xx' | 'timeout' | 'validation' | 'none' = 'none';

  private makeKey(employeeId: string, locationId: string, leaveType: string): string {
    return `${employeeId}:${locationId}:${leaveType}`;
  }

  setBalance(employeeId: string, locationId: string, leaveType: string, availableUnits: number): void {
    const key = this.makeKey(employeeId, locationId, leaveType);
    this.balances.set(key, { employeeId, locationId, leaveType, availableUnits });
  }

  getBalance(employeeId: string, locationId: string, leaveType: string): MockHcmBalance | undefined {
    return this.balances.get(this.makeKey(employeeId, locationId, leaveType));
  }

  getAllBalances(): MockHcmBalance[] {
    return Array.from(this.balances.values());
  }

  reset(): void {
    this.balances.clear();
    this.failureRate = 0;
    this.failureType = 'none';
  }

  setFailureConfig(rate: number, type: '5xx' | 'timeout' | 'validation' | 'none'): void {
    this.failureRate = rate;
    this.failureType = type;
  }

  private shouldFail(): boolean {
    return Math.random() < this.failureRate;
  }

  async validateTimeOff(
    employeeId: string,
    locationId: string,
    leaveType: string,
    units: number,
  ): Promise<MockHcmValidationResult> {
    if (this.shouldFail()) {
      if (this.failureType === 'timeout') {
        throw new Error('HCM_TIMEOUT');
      }
      if (this.failureType === '5xx') {
        throw new Error('HCM_5XX');
      }
      return { valid: false, errorCode: 'HCM_UNAVAILABLE', errorMessage: 'Simulated HCM failure' };
    }

    const balance = this.getBalance(employeeId, locationId, leaveType);
    if (!balance) {
      return {
        valid: false,
        errorCode: 'INVALID_DIMENSION_COMBINATION',
        errorMessage: `No balance found for ${employeeId}/${locationId}/${leaveType}`,
      };
    }

    if (balance.availableUnits < units) {
      return {
        valid: false,
        errorCode: 'INSUFFICIENT_BALANCE',
        errorMessage: `Available ${balance.availableUnits}, requested ${units}`,
        remainingBalance: balance.availableUnits,
      };
    }

    return {
      valid: true,
      remainingBalance: balance.availableUnits - units,
    };
  }

  async applyTimeOff(
    employeeId: string,
    locationId: string,
    leaveType: string,
    units: number,
  ): Promise<MockHcmValidationResult> {
    if (this.shouldFail()) {
      if (this.failureType === 'timeout') {
        throw new Error('HCM_TIMEOUT');
      }
      if (this.failureType === '5xx') {
        throw new Error('HCM_5XX');
      }
      return { valid: false, errorCode: 'HCM_UNAVAILABLE', errorMessage: 'Simulated HCM failure' };
    }

    const balance = this.getBalance(employeeId, locationId, leaveType);
    if (!balance) {
      return {
        valid: false,
        errorCode: 'INVALID_DIMENSION_COMBINATION',
        errorMessage: `No balance found for ${employeeId}/${locationId}/${leaveType}`,
      };
    }

    if (balance.availableUnits < units) {
      return {
        valid: false,
        errorCode: 'INSUFFICIENT_BALANCE',
        errorMessage: `Available ${balance.availableUnits}, requested ${units}`,
        remainingBalance: balance.availableUnits,
      };
    }

    balance.availableUnits -= units;
    this.balances.set(this.makeKey(employeeId, locationId, leaveType), balance);

    return {
      valid: true,
      remainingBalance: balance.availableUnits,
    };
  }

  simulateBatchExport(): MockHcmBalance[] {
    if (this.shouldFail()) {
      throw new Error('HCM_BATCH_UNAVAILABLE');
    }
    return this.getAllBalances();
  }

  simulateAnniversaryBonus(employeeId: string, locationId: string, leaveType: string, bonusUnits: number): void {
    const key = this.makeKey(employeeId, locationId, leaveType);
    const existing = this.balances.get(key);
    if (existing) {
      existing.availableUnits += bonusUnits;
      this.balances.set(key, existing);
    }
  }

  simulateYearlyReset(balances: MockHcmBalance[]): void {
    this.balances.clear();
    for (const b of balances) {
      this.setBalance(b.employeeId, b.locationId, b.leaveType, b.availableUnits);
    }
  }
}
