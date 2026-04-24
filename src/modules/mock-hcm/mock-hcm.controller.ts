import { Controller, Get, Post, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { MockHcmService, MockHcmBalance } from './mock-hcm.service';

class SetBalanceDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
  availableUnits: number;
}

class ValidateDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
  units: number;
}

class ApplyDto {
  employeeId: string;
  locationId: string;
  leaveType: string;
  units: number;
}

class FailureConfigDto {
  rate: number;
  type: '5xx' | 'timeout' | 'validation' | 'none';
}

class BatchBalanceDto {
  balances: MockHcmBalance[];
}

@Controller('mock-hcm')
export class MockHcmController {
  constructor(private readonly mockHcmService: MockHcmService) {}

  @Post('balances')
  setBalance(@Body() dto: SetBalanceDto) {
    this.mockHcmService.setBalance(dto.employeeId, dto.locationId, dto.leaveType, dto.availableUnits);
    return { status: 'ok' };
  }

  @Get('balances/:employeeId')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
    @Query('leaveType') leaveType: string,
  ) {
    const balance = this.mockHcmService.getBalance(employeeId, locationId, leaveType);
    if (!balance) {
      throw new HttpException('Balance not found', HttpStatus.NOT_FOUND);
    }
    return balance;
  }

  @Post('time-off/validate')
  async validate(@Body() dto: ValidateDto) {
    try {
      const result = await this.mockHcmService.validateTimeOff(dto.employeeId, dto.locationId, dto.leaveType, dto.units);
      return result;
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Post('time-off/apply')
  async apply(@Body() dto: ApplyDto) {
    try {
      const result = await this.mockHcmService.applyTimeOff(dto.employeeId, dto.locationId, dto.leaveType, dto.units);
      return result;
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Post('balances/batch-export')
  batchExport() {
    try {
      return this.mockHcmService.simulateBatchExport();
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Post('balances/batch-import')
  batchImport(@Body() dto: BatchBalanceDto) {
    this.mockHcmService.simulateYearlyReset(dto.balances);
    return { status: 'ok', count: dto.balances.length };
  }

  @Post('config/failure')
  setFailure(@Body() dto: FailureConfigDto) {
    this.mockHcmService.setFailureConfig(dto.rate, dto.type);
    return { status: 'ok' };
  }

  @Post('reset')
  reset() {
    this.mockHcmService.reset();
    return { status: 'ok' };
  }
}
