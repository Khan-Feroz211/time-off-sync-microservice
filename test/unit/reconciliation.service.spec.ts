import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReconciliationService } from '../../src/modules/reconciliation/reconciliation.service';
import { ReconciliationRun, ReconciliationStatus } from '../../src/entities/reconciliation-run.entity';
import { LeaveBalance } from '../../src/entities/leave-balance.entity';
import { Employee } from '../../src/entities/employee.entity';
import { Location } from '../../src/entities/location.entity';
import { HcmIntegrationService } from '../../src/modules/hcm-integration/hcm-integration.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { AppModule } from '../../src/app.module';
import { seedEmployeeAndLocation } from '../utils/seed';

describe('ReconciliationService', () => {
  let module: TestingModule;
  let service: ReconciliationService;
  let runRepo: Repository<ReconciliationRun>;
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

    service = module.get(ReconciliationService);
    runRepo = module.get(getRepositoryToken(ReconciliationRun));
    leaveBalanceRepo = module.get(getRepositoryToken(LeaveBalance));
    employeeRepo = module.get(getRepositoryToken(Employee));
    locationRepo = module.get(getRepositoryToken(Location));
  });

  afterEach(async () => {
    await module.close();
  });

  it('should detect drift and correct balances', async () => {
    const { employee, location } = await seedEmployeeAndLocation(employeeRepo, locationRepo);
    await leaveBalanceRepo.save({
      employeeId: employee.id,
      locationId: location.id,
      leaveType: 'PTO',
      availableUnits: 5,
      pendingUnits: 0,
    });
    mockHcmService.setBalance(employee.externalHcmEmployeeId, location.externalHcmLocationId, 'PTO', 12);

    const result = await service.runReconciliation();
    expect(result.status).toBe(ReconciliationStatus.COMPLETED);
    expect(result.recordsScanned).toBe(1);
    expect(result.driftCount).toBe(1);

    const local = await leaveBalanceRepo.findOne({ where: { employeeId: employee.id, leaveType: 'PTO' } });
    expect(Number(local!.availableUnits)).toBe(12);
  });

  it('should handle HCM failures gracefully and complete run', async () => {
    const { employee, location } = await seedEmployeeAndLocation(employeeRepo, locationRepo);
    await leaveBalanceRepo.save({
      employeeId: employee.id,
      locationId: location.id,
      leaveType: 'PTO',
      availableUnits: 5,
      pendingUnits: 0,
    });
    mockHcmService.setFailureConfig(1, '5xx');

    const result = await service.runReconciliation();
    expect(result.status).toBe(ReconciliationStatus.COMPLETED);
    expect(result.actionSummary).toContain('FAIL:');
  });

  it('should return runs ordered by startedAt DESC', async () => {
    await service.runReconciliation();
    await service.runReconciliation();

    const runs = await service.getRuns();
    expect(runs.length).toBe(2);
    expect(runs[0].startedAt.getTime()).toBeGreaterThanOrEqual(runs[1].startedAt.getTime());
  });
});
