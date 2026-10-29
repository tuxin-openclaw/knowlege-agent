import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ModelConfigService } from './model-config.service.js';

@Controller('api/model-configs')
export class ModelConfigController {
  constructor(private readonly configs: ModelConfigService) {}

  @Get()
  list() {
    return this.configs.list();
  }

  /** 单条详情；页面编辑前用它读取最新配置，避免基于列表里的旧数据修改。 */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.configs.detail(id);
  }

  @Post()
  create(@Body() body: unknown) {
    return this.configs.save(body);
  }

  /** 更新配置；请求中不传 apiKey 表示保留原密钥。 */
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.configs.save(body, id);
  }

  @Post(':id/default')
  @HttpCode(200)
  setDefault(@Param('id') id: string) {
    return this.configs.setDefault(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.configs.remove(id);
  }
}
