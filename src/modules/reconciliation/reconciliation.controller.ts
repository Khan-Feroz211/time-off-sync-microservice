import { Controller, Post, Get, HttpCode } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  @HttpCode(200)
  async run() {
    return this.reconciliationService.runReconciliation();
  }

  @Get('runs')
  async getRuns() {
    return this.reconciliationService.getRuns();
  }
}
