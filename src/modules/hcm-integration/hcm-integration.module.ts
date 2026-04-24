import { Module } from '@nestjs/common';
import { HcmIntegrationService } from './hcm-integration.service';
import { MockHcmModule } from '../mock-hcm/mock-hcm.module';

@Module({
  imports: [MockHcmModule],
  providers: [HcmIntegrationService],
  exports: [HcmIntegrationService],
})
export class HcmIntegrationModule {}
