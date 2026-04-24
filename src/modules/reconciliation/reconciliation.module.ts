import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationRun } from '../../entities/reconciliation-run.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { Employee } from '../../entities/employee.entity';
import { Location } from '../../entities/location.entity';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { HcmIntegrationModule } from '../hcm-integration/hcm-integration.module';
import { BalancesModule } from '../balances/balances.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReconciliationRun, LeaveBalance, Employee, Location]), HcmIntegrationModule, BalancesModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
