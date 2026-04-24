import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Location } from './entities/location.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { SyncEvent } from './entities/sync-event.entity';
import { ReconciliationRun } from './entities/reconciliation-run.entity';
import { MockHcmModule } from './modules/mock-hcm/mock-hcm.module';
import { BalancesModule } from './modules/balances/balances.module';
import { TimeOffRequestsModule } from './modules/time-off-requests/time-off-requests.module';
import { HcmIntegrationModule } from './modules/hcm-integration/hcm-integration.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.NODE_ENV === 'test' ? ':memory:' : 'data/timeoff.db',
      entities: [Employee, Location, LeaveBalance, TimeOffRequest, SyncEvent, ReconciliationRun],
      synchronize: true,
      logging: process.env.NODE_ENV === 'test' ? false : false,
    }),
    MockHcmModule,
    BalancesModule,
    TimeOffRequestsModule,
    HcmIntegrationModule,
    ReconciliationModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
