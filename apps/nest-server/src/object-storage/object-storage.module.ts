import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service.js';
import { S3CompatibleStorageAdapter } from './s3-compatible-storage.adapter.js';
import { OBJECT_STORAGE_ADAPTER } from './object-storage.types.js';
import { UploadController } from './upload.controller.js';

@Module({
  controllers: [UploadController],
  providers: [
    ObjectStorageService,
    S3CompatibleStorageAdapter,
    {
      provide: OBJECT_STORAGE_ADAPTER,
      useExisting: S3CompatibleStorageAdapter,
    },
  ],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
