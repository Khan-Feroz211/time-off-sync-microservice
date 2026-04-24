import { Controller, Post, Get, Body, Param, Query, HttpCode } from '@nestjs/common';
import { TimeOffRequestsService } from './time-off-requests.service';
import type { CreateRequestDto } from './time-off-requests.service';
import { RequestStatus } from '../../entities/time-off-request.entity';
import { SyncStatus } from '../../entities/sync-event.entity';

class ApproveDto {
  managerId?: string;
}

class RejectDto {
  managerId?: string;
}

@Controller('time-off-requests')
export class TimeOffRequestsController {
  constructor(private readonly timeOffRequestsService: TimeOffRequestsService) {}

  @Post()
  async create(@Body() dto: CreateRequestDto) {
    return this.timeOffRequestsService.createRequest(dto);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.timeOffRequestsService.getRequest(id);
  }

  @Get()
  async list(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: RequestStatus,
  ) {
    return this.timeOffRequestsService.listRequests(employeeId, status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id') id: string, @Body() dto: ApproveDto) {
    return this.timeOffRequestsService.approveRequest(id, dto.managerId);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.timeOffRequestsService.rejectRequest(id, dto.managerId);
  }

  @Post(':id/retry-sync')
  @HttpCode(200)
  async retrySync(@Param('id') id: string) {
    return this.timeOffRequestsService.retrySync(id);
  }

  @Get('sync-events/all')
  async syncEvents(
    @Query('requestId') requestId?: string,
    @Query('status') status?: SyncStatus,
  ) {
    return this.timeOffRequestsService.getSyncEvents(requestId, status);
  }
}
