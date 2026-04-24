import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalancesService } from '../../src/modules/balances/balances.service';
import { LeaveBalance } from '../../src/entities/leave-balance.entity';
import { Employee } from '../../src/entities/employee.entity';
import { Location } from '../../src/entities/location.entity';
import { HcmIntegrationService } from '../../src/modules/hcm-integration/hcm-integration.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { AppModule } from '../../src/app.module';
import { seedEmployeeAndLocation } from '../utils/seed';

describe('BalancesService', () => {
  let module: TestingModule;
  let service: BalancesService;
  let leaveBalanceRepo: Repository<LeaveBalance>;
  let employeeRepo: Repository<Employee>;
  let locationRepo: Repository<Location>;
  let mockHcmService: MockHcmService;

  beforeEach(async () => {
    mockHcmService = new MockHcmService();
    process.env.NODE_ENV = 'test';

    module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HcmIntegrationService)
      .useValue(new HcmIntegrationService(mockHcmService))
      .compile();

    service = module.get(BalancesService);
    leaveBalanceRepo = module.get(getRepositoryToken(LeaveBalance));
    employeeRepo = module.get(getRepositoryToken(Employee));
    locationRepo = module.get(getRepositoryToken(Location));
  });

  afterEach(async () => {
    await module.close();
  });

  async function seed() {
    const { employee, location } = await seedEmployeeAndLocation(employeeRepo, locationRepo);
    mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);
    return { employee, location };
  }

  describe('getBalance', () => {
    it('should return balances for employee', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 5,
        pendingUnits: 1,
      });

      const balances = await service.getBalance(employee.externalHcmEmployeeId);
      expect(balances).toHaveLength(1);
      expect(Number(balances[0].availableUnits)).toBe(5);
    });

    it('should throw if employee not found', async () => {
      await expect(service.getBalance('unknown')).rejects.toThrow('Employee not found');
    });
  });

  describe('getOrCreateBalance', () => {
    it('should create balance if missing', async () => {
      const { employee, location } = await seed();
      const balance = await service.getOrCreateBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO');
      expect(balance).toBeDefined();
      expect(balance.leaveType).toBe('PTO');
    });

    it('should return existing balance', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 8,
        pendingUnits: 0,
      });

      const balance = await service.getOrCreateBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO');
      expect(Number(balance.availableUnits)).toBe(8);
    });
  });

  describe('syncRealtime', () => {
    it('should update local balance from HCM', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 5,
        pendingUnits: 0,
      });

      const result = await service.syncRealtime(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO');
      expect(Number(result.availableUnits)).toBe(10);
    });
  });

  describe('syncBatch', () => {
    it('should import batch balances from HCM', async () => {
      const { employee, location } = await seed();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 15);

      const result = await service.syncBatch();
      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);

      const local = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(local!.availableUnits)).toBe(15);
    });
  });

  describe('reconcile', () => {
    it('should detect and correct drift', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 3,
        pendingUnits: 0,
      });

      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 12);

      const result = await service.reconcile();
      expect(result.scanned).toBe(1);
      expect(result.drift).toBe(1);
      expect(result.corrected).toBe(1);

      const local = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(local!.availableUnits)).toBe(12);
    });
  });

  describe('adjustPendingUnits', () => {
    it('should increase pending units', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 10,
        pendingUnits: 0,
      });

      await service.adjustPendingUnits(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 2);
      const local = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(local!.pendingUnits)).toBe(2);
    });

    it('should throw if pending goes negative', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 10,
        pendingUnits: 0,
      });

      await expect(
        service.adjustPendingUnits(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', -1),
      ).rejects.toThrow('Pending units cannot go negative');
    });
  });

  describe('commitDeduction', () => {
    it('should deduct from available and pending', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 10,
        pendingUnits: 2,
      });

      await service.commitDeduction(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 2);
      const local = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(local!.availableUnits)).toBe(8);
      expect(Number(local!.pendingUnits)).toBe(0);
    });

    it('should throw if available goes negative', async () => {
      const { employee, location } = await seed();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 1,
        pendingUnits: 1,
      });

      await expect(
        service.commitDeduction(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 2),
      ).rejects.toThrow('Insufficient balance after deduction');
    });
  });
});
