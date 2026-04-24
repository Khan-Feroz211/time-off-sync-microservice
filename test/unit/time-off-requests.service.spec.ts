import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffRequestsService } from '../../src/modules/time-off-requests/time-off-requests.service';
import { TimeOffRequest, RequestStatus } from '../../src/entities/time-off-request.entity';
import { SyncEvent, SyncStatus } from '../../src/entities/sync-event.entity';
import { Employee } from '../../src/entities/employee.entity';
import { Location } from '../../src/entities/location.entity';
import { LeaveBalance } from '../../src/entities/leave-balance.entity';
import { BalancesService } from '../../src/modules/balances/balances.service';
import { HcmIntegrationService } from '../../src/modules/hcm-integration/hcm-integration.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { AppModule } from '../../src/app.module';
import { seedEmployeeAndLocation } from '../utils/seed';

describe('TimeOffRequestsService', () => {
  let module: TestingModule;
  let service: TimeOffRequestsService;
  let requestRepo: Repository<TimeOffRequest>;
  let syncEventRepo: Repository<SyncEvent>;
  let employeeRepo: Repository<Employee>;
  let locationRepo: Repository<Location>;
  let leaveBalanceRepo: Repository<LeaveBalance>;
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

    service = module.get(TimeOffRequestsService);
    requestRepo = module.get(getRepositoryToken(TimeOffRequest));
    syncEventRepo = module.get(getRepositoryToken(SyncEvent));
    employeeRepo = module.get(getRepositoryToken(Employee));
    locationRepo = module.get(getRepositoryToken(Location));
    leaveBalanceRepo = module.get(getRepositoryToken(LeaveBalance));
  });

  afterEach(async () => {
    await module.close();
  });

  async function seed() {
    const { employee, location } = await seedEmployeeAndLocation(employeeRepo, locationRepo);
    mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);
    return { employee, location };
  }

  describe('createRequest', () => {
    it('should create a request and validate with HCM', async () => {
      const { employee, location } = await seed();

      const result = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      expect(result.status).toBe(RequestStatus.PENDING_MANAGER_APPROVAL);
      expect(result.units).toBe(2);

      const balance = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(balance!.pendingUnits)).toBe(2);

      const events = await syncEventRepo.find();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].status).toBe(SyncStatus.SUCCESS);
    });

    it('should reject if local balance is insufficient', async () => {
      const { employee, location } = await seed();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 0);

      await expect(
        service.createRequest({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 5,
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        }),
      ).rejects.toThrow('Insufficient balance');
    });

    it('should reject if HCM validation fails (stale local balance)', async () => {
      const { employee, location } = await seed();
      await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 1);

      await expect(
        service.createRequest({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 5,
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        }),
      ).rejects.toThrow('Available 1, requested 5');
    });

    it('should reject invalid dimensions', async () => {
      await expect(
        service.createRequest({
          employeeId: 'unknown',
          locationId: 'unknown',
          leaveType: 'PTO',
          units: 1,
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        }),
      ).rejects.toThrow('Invalid employee or location');
    });

    it('should reject zero or negative units', async () => {
      const { employee, location } = await seed();
      await expect(
        service.createRequest({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 0,
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        }),
      ).rejects.toThrow('Units must be positive');
    });
  });

  describe('approveRequest', () => {
    it('should approve and sync to HCM', async () => {
      const { employee, location } = await seed();
      const created = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      const result = await service.approveRequest(created.id, 'manager-1');
      expect(result.status).toBe(RequestStatus.SYNCED);
      expect(result.managerId).toBe('manager-1');
      expect(result.hcmReference).toBeDefined();

      const balance = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(balance!.availableUnits)).toBe(8);
      expect(Number(balance!.pendingUnits)).toBe(0);
    });

    it('should throw if HCM validation fails during approval', async () => {
      const { employee, location } = await seed();
      const created = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 0);

      await expect(service.approveRequest(created.id)).rejects.toThrow('Available 0, requested 2');
    });
  });

  describe('rejectRequest', () => {
    it('should reject and release pending units', async () => {
      const { employee, location } = await seed();
      const created = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      const result = await service.rejectRequest(created.id, 'manager-1');
      expect(result.status).toBe(RequestStatus.REJECTED);

      const balance = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(balance!.pendingUnits)).toBe(0);
    });
  });

  describe('retrySync', () => {
    it('should retry failed sync and succeed', async () => {
      const { employee, location } = await seed();
      const created = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      const req = await requestRepo.findOne({ where: { id: created.id } });
      req!.status = RequestStatus.SYNC_FAILED;
      req!.failureReason = 'HCM timeout';
      await requestRepo.save(req!);

      const result = await service.retrySync(created.id);
      expect(result.status).toBe(RequestStatus.SYNCED);
    });

    it('should throw if status is not SYNC_FAILED or RETRYING', async () => {
      const { employee, location } = await seed();
      const created = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      await expect(service.retrySync(created.id)).rejects.toThrow('Cannot retry from status');
    });
  });

  describe('status transitions', () => {
    it('should enforce valid transitions', async () => {
      const { employee, location } = await seed();
      const created = await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      await service.rejectRequest(created.id);
      await expect(service.approveRequest(created.id)).rejects.toThrow('Cannot transition');
    });
  });

  describe('listRequests', () => {
    it('should filter by employee and status', async () => {
      const { employee, location } = await seed();
      await service.createRequest({
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-01-01',
        endDate: '2025-01-02',
      });

      const results = await service.listRequests(employee.externalHcmEmployeeId, RequestStatus.PENDING_MANAGER_APPROVAL);
      expect(results).toHaveLength(1);
    });
  });
});
