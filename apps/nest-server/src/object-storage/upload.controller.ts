import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import {
  MAX_UPLOAD_BYTES,
  ObjectStorageService,
} from './object-storage.service.js';

@Controller('api/uploads')
export class UploadController {
  constructor(private readonly storage: ObjectStorageService) {}

  @Get('config')
  getConfig() {
    return this.storage.getStatus();
  }

  @Post('presign')
  createUpload(
    @Body() body: { name?: string; size?: number; contentType?: string },
  ) {
    if (
      typeof body.name !== 'string' ||
      typeof body.size !== 'number' ||
      body.size <= 0 ||
      body.size > MAX_UPLOAD_BYTES
    ) {
      throw new BadRequestException('文件必须非空且不超过 10 MB');
    }
    return this.storage.createUpload({
      name: body.name,
      size: body.size,
      contentType: typeof body.contentType === 'string' ? body.contentType : '',
    });
  }
}
