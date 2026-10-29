import { Global, Module } from '@nestjs/common';
import { ModelUsageController } from './model-usage.controller.js';
import { ModelUsageService } from './model-usage.service.js';

@Global()
@Module({
  controllers: [ModelUsageController],
  providers: [ModelUsageService],
  exports: [ModelUsageService],
})
export class ModelUsageModule {}
