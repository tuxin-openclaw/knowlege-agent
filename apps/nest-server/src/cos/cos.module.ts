import { Module } from '@nestjs/common';
import { CosController } from './cos.controller.js';
import { CosService } from './cos.service.js';

@Module({
  controllers: [CosController],
  providers: [CosService],
})
export class CosModule {}
