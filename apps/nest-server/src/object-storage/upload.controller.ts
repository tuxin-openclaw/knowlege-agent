import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file || file.size === 0)
      throw new BadRequestException('请选择一个非空文件');
    return this.storage.upload(file);
  }
}
