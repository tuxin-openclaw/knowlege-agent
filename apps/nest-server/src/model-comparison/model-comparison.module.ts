import { Module } from '@nestjs/common';
import { ModelComparisonController } from './model-comparison.controller.js';

@Module({ controllers: [ModelComparisonController] })
export class ModelComparisonModule {}
