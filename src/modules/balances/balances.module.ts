import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { Employee } from '../../entities/employee.entity';
import { Location } from '../../entities/location.entity';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';
import { HcmIntegrationModule } from '../hcm-integration/hcm-integration.module';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveBalance, Employee, Location]), HcmIntegrationModule],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
