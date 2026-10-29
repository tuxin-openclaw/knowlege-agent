import { Global, Module } from '@nestjs/common';
import { ModelConfigController } from './model-config.controller.js';
import { ModelConfigService } from './model-config.service.js';

/** 全局提供模型配置，使文本对比和生图模块都能按类型取到当前模型。 */
@Global()
@Module({
  controllers: [ModelConfigController],
  providers: [ModelConfigService],
  exports: [ModelConfigService],
})
export class ModelConfigModule {}
