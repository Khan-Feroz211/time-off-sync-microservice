import { Controller, Get, Post, Body, Param, Query, HttpCode } from '@nestjs/common';
import { BalancesService } from './balances.service';

class SyncRealtimeDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
}

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get(':employeeId')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId?: string,
    @Query('leaveType') leaveType?: string,
  ) {
    return this.balancesService.getBalance(employeeId, locationId, leaveType);
  }

  @Post('sync/realtime')
  async syncRealtime(@Body() dto: SyncRealtimeDto) {
    return this.balancesService.syncRealtime(dto.employeeId, dto.locationId, dto.leaveType);
  }

  @Post('sync/batch')
  @HttpCode(200)
  async syncBatch() {
    return this.balancesService.syncBatch();
  }

  @Post('reconcile')
  @HttpCode(200)
  async reconcile() {
    return this.balancesService.reconcile();
  }
}
