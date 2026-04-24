import '../setup';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Employee } from '../../src/entities/employee.entity';
import { Location } from '../../src/entities/location.entity';
import { LeaveBalance } from '../../src/entities/leave-balance.entity';
import { TimeOffRequest, RequestStatus } from '../../src/entities/time-off-request.entity';
import { SyncEvent } from '../../src/entities/sync-event.entity';
import { ReconciliationRun } from '../../src/entities/reconciliation-run.entity';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';

describe('TimeOff Lifecycle (e2e)', () => {
  let app: INestApplication;
  let employeeRepo: Repository<Employee>;
  let locationRepo: Repository<Location>;
  let leaveBalanceRepo: Repository<LeaveBalance>;
  let requestRepo: Repository<TimeOffRequest>;
  let syncEventRepo: Repository<SyncEvent>;
  let mockHcmService: MockHcmService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    employeeRepo = moduleFixture.get(getRepositoryToken(Employee));
    locationRepo = moduleFixture.get(getRepositoryToken(Location));
    leaveBalanceRepo = moduleFixture.get(getRepositoryToken(LeaveBalance));
    requestRepo = moduleFixture.get(getRepositoryToken(TimeOffRequest));
    syncEventRepo = moduleFixture.get(getRepositoryToken(SyncEvent));

    mockHcmService = moduleFixture.get(MockHcmService);
  });

  beforeEach(async () => {
    await syncEventRepo.clear();
    await requestRepo.clear();
    await leaveBalanceRepo.clear();
    await employeeRepo.clear();
    await locationRepo.clear();
    mockHcmService.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedEmployeeAndLocation() {
    const employee = await employeeRepo.save({
      externalHcmEmployeeId: 'emp-001',
      firstName: 'Test',
      lastName: 'User',
      status: 'ACTIVE',
    });
    const location = await locationRepo.save({
      externalHcmLocationId: 'loc-001',
      name: 'HQ',
      countryCode: 'US',
    });
    return { employee, location };
  }

  describe('happy path', () => {
    it('should create, approve, and sync a time-off request', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 2,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(201);

      expect(createRes.body.status).toBe(RequestStatus.PENDING_MANAGER_APPROVAL);
      const requestId = createRes.body.id;

      const approveRes = await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/approve`)
        .send({ managerId: 'mgr-001' })
        .expect(200);

      expect(approveRes.body.status).toBe(RequestStatus.SYNCED);
      expect(approveRes.body.hcmReference).toBeDefined();
      expect(approveRes.body.managerId).toBe('mgr-001');

      const balanceRes = await request(app.getHttpServer())
        .get(`/balances/${employee.externalHcmEmployeeId}`)
        .query({ locationId: location.externalHcmLocationId, leaveType: 'PTO' })
        .expect(200);

      expect(Number(balanceRes.body[0].availableUnits)).toBe(8);
      expect(Number(balanceRes.body[0].pendingUnits)).toBe(0);
    });
  });

  describe('defensive validation', () => {
    it('should reject request with insufficient balance', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 1);

      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 5,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(400);
    });

    it('should reject invalid dimensions', async () => {
      await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: 'unknown',
          locationId: 'unknown',
          leaveType: 'PTO',
          units: 1,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(400);
    });
  });

  describe('manager rejection', () => {
    it('should reject and release pending units', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 3,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(201);

      const requestId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/reject`)
        .send({ managerId: 'mgr-002' })
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe(RequestStatus.REJECTED);
        });

      const balanceRes = await request(app.getHttpServer())
        .get(`/balances/${employee.externalHcmEmployeeId}`)
        .query({ locationId: location.externalHcmLocationId, leaveType: 'PTO' })
        .expect(200);

      expect(Number(balanceRes.body[0].pendingUnits)).toBe(0);
    });
  });

  describe('HCM failure and retry', () => {
    it('should handle HCM failure on approval and retry successfully', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 2,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(201);

      const requestId = createRes.body.id;

      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 0);

      await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/approve`)
        .expect(400);

      const reqAfterFail = await requestRepo.findOne({ where: { id: requestId } });
      expect(reqAfterFail!.status).toBe(RequestStatus.SYNC_FAILED);

      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/retry-sync`)
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe(RequestStatus.SYNCED);
        });
    });
  });

  describe('batch sync and drift', () => {
    it('should import batch balances and reconcile drift', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 5,
        pendingUnits: 0,
      });
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 20);

      await request(app.getHttpServer())
        .post('/balances/sync/batch')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.updated).toBe(1);
        });

      const balanceAfterBatch = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(balanceAfterBatch!.availableUnits)).toBe(20);

      mockHcmService.simulateAnniversaryBonus(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 5);

      const reconcileRes = await request(app.getHttpServer())
        .post('/balances/reconcile')
        .expect(200);

      expect(reconcileRes.body.drift).toBe(1);

      const balanceAfterReconcile = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(balanceAfterReconcile!.availableUnits)).toBe(25);
    });
  });

  describe('sync events audit trail', () => {
    it('should record sync events for request lifecycle', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 2,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(201);

      const requestId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/approve`)
        .expect(200);

      const events = await syncEventRepo.find({ where: { requestId } });
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('reconciliation run tracking', () => {
    it('should track reconciliation runs', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      await leaveBalanceRepo.save({
        employeeId: employee.id,
        locationId: location.id,
        leaveType: 'PTO',
        availableUnits: 3,
        pendingUnits: 0,
      });
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      await request(app.getHttpServer())
        .post('/reconciliation/run')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('COMPLETED');
          expect(res.body.driftCount).toBe(1);
        });

      await request(app.getHttpServer())
        .get('/reconciliation/runs')
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(1);
        });
    });
  });

  describe('status transition guards', () => {
    it('should prevent invalid transitions', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .send({
          employeeId: employee.externalHcmEmployeeId,
          locationId: location.externalHcmLocationId,
          leaveType: 'PTO',
          units: 2,
          startDate: '2025-06-01',
          endDate: '2025-06-02',
        })
        .expect(201);

      const requestId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/reject`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/time-off-requests/${requestId}/approve`)
        .expect(400);
    });
  });

  describe('concurrency and idempotency', () => {
    it('should handle rapid duplicate submissions safely', async () => {
      const { employee, location } = await seedEmployeeAndLocation();
      mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 10);

      const payload = {
        employeeId: employee.externalHcmEmployeeId,
        locationId: location.externalHcmLocationId,
        leaveType: 'PTO',
        units: 2,
        startDate: '2025-06-01',
        endDate: '2025-06-02',
      };

      const responses = await Promise.all([
        request(app.getHttpServer()).post('/time-off-requests').send(payload),
        request(app.getHttpServer()).post('/time-off-requests').send(payload),
      ]);

      expect(responses[0].status).toBe(201);
      expect(responses[1].status).toBe(201);

      const requests = await requestRepo.find();
      expect(requests.length).toBe(2);

      const balance = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
      expect(Number(balance!.pendingUnits)).toBe(4);
    });
  });
});
