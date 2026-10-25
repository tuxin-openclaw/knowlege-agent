import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CosService, MAX_UPLOAD_BYTES } from './cos.service.js';

@Controller('api/uploads')
export class CosController {
  constructor(private readonly cosService: CosService) {}

  @Get('config')
  getConfig() {
    return this.cosService.getStatus();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file || file.size === 0) {
      throw new BadRequestException('请选择一个非空文件');
    }
    return this.cosService.upload(file);
  }
}
