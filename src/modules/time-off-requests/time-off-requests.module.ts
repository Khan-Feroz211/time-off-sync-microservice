import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from '../../entities/time-off-request.entity';
import { SyncEvent } from '../../entities/sync-event.entity';
import { Employee } from '../../entities/employee.entity';
import { Location } from '../../entities/location.entity';
import { TimeOffRequestsController } from './time-off-requests.controller';
import { TimeOffRequestsService } from './time-off-requests.service';
import { BalancesModule } from '../balances/balances.module';
import { HcmIntegrationModule } from '../hcm-integration/hcm-integration.module';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest, SyncEvent, Employee, Location]), BalancesModule, HcmIntegrationModule],
  controllers: [TimeOffRequestsController],
  providers: [TimeOffRequestsService],
  exports: [TimeOffRequestsService],
})
export class TimeOffRequestsModule {}
