import { Controller, Get, Query } from '@nestjs/common';
import { ModelUsageService } from './model-usage.service.js';

@Controller('api/model-usage')
export class ModelUsageController {
  constructor(private readonly usage: ModelUsageService) {}
  @Get('dashboard')
  dashboard(@Query() query: Record<string, unknown>) {
    return this.usage.dashboard(query);
  }
  @Get('summary') summary(@Query() query: Record<string, unknown>) {
    return this.usage.summary(query);
  }
  @Get('calls') calls(@Query() query: Record<string, unknown>) {
    return this.usage.calls(query);
  }
}
