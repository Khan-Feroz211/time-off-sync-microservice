import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../../src/entities/employee.entity';
import { Location } from '../../src/entities/location.entity';
import { LeaveBalance } from '../../src/entities/leave-balance.entity';
import { TimeOffRequest } from '../../src/entities/time-off-request.entity';
import { SyncEvent } from '../../src/entities/sync-event.entity';
import { ReconciliationRun } from '../../src/entities/reconciliation-run.entity';

let dbCounter = 0;

export const TestDatabaseModule = () =>
  TypeOrmModule.forRoot({
    type: 'sqlite',
    database: `test/tmp/test-${Date.now()}-${++dbCounter}.db`,
    entities: [Employee, Location, LeaveBalance, TimeOffRequest, SyncEvent, ReconciliationRun],
    synchronize: true,
    logging: false,
  });
