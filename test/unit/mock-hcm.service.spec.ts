import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';

describe('MockHcmService', () => {
  let service: MockHcmService;

  beforeEach(() => {
    service = new MockHcmService();
  });

  afterEach(() => {
    service.reset();
  });

  describe('balance management', () => {
    it('should set and get a balance', () => {
      service.setBalance('e1', 'l1', 'PTO', 10);
      const balance = service.getBalance('e1', 'l1', 'PTO');
      expect(balance).toBeDefined();
      expect(balance!.availableUnits).toBe(10);
    });

    it('should return undefined for missing balance', () => {
      const balance = service.getBalance('e1', 'l1', 'PTO');
      expect(balance).toBeUndefined();
    });

    it('should get all balances', () => {
      service.setBalance('e1', 'l1', 'PTO', 10);
      service.setBalance('e2', 'l1', 'SICK', 5);
      const all = service.getAllBalances();
      expect(all).toHaveLength(2);
    });
  });

  describe('validateTimeOff', () => {
    it('should validate successfully when balance is sufficient', async () => {
      service.setBalance('e1', 'l1', 'PTO', 10);
      const result = await service.validateTimeOff('e1', 'l1', 'PTO', 2);
      expect(result.valid).toBe(true);
      expect(result.remainingBalance).toBe(8);
    });

    it('should reject when balance is insufficient', async () => {
      service.setBalance('e1', 'l1', 'PTO', 1);
      const result = await service.validateTimeOff('e1', 'l1', 'PTO', 2);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INSUFFICIENT_BALANCE');
    });

    it('should reject for invalid dimension combination', async () => {
      const result = await service.validateTimeOff('e1', 'l1', 'PTO', 1);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_DIMENSION_COMBINATION');
    });

    it('should throw on timeout failure', async () => {
      service.setFailureConfig(1, 'timeout');
      await expect(service.validateTimeOff('e1', 'l1', 'PTO', 1)).rejects.toThrow('HCM_TIMEOUT');
    });

    it('should throw on 5xx failure', async () => {
      service.setFailureConfig(1, '5xx');
      await expect(service.validateTimeOff('e1', 'l1', 'PTO', 1)).rejects.toThrow('HCM_5XX');
    });
  });

  describe('applyTimeOff', () => {
    it('should deduct balance on apply', async () => {
      service.setBalance('e1', 'l1', 'PTO', 10);
      const result = await service.applyTimeOff('e1', 'l1', 'PTO', 3);
      expect(result.valid).toBe(true);
      expect(result.remainingBalance).toBe(7);
      expect(service.getBalance('e1', 'l1', 'PTO')!.availableUnits).toBe(7);
    });

    it('should reject apply for insufficient balance', async () => {
      service.setBalance('e1', 'l1', 'PTO', 1);
      const result = await service.applyTimeOff('e1', 'l1', 'PTO', 5);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INSUFFICIENT_BALANCE');
    });
  });

  describe('simulateAnniversaryBonus', () => {
    it('should add bonus units to existing balance', () => {
      service.setBalance('e1', 'l1', 'PTO', 10);
      service.simulateAnniversaryBonus('e1', 'l1', 'PTO', 5);
      expect(service.getBalance('e1', 'l1', 'PTO')!.availableUnits).toBe(15);
    });
  });

  describe('simulateYearlyReset', () => {
    it('should reset all balances', () => {
      service.setBalance('e1', 'l1', 'PTO', 10);
      service.simulateYearlyReset([
        { employeeId: 'e1', locationId: 'l1', leaveType: 'PTO', availableUnits: 20 },
      ]);
      expect(service.getBalance('e1', 'l1', 'PTO')!.availableUnits).toBe(20);
    });
  });
});
