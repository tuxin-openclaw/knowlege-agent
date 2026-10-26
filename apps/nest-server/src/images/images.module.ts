import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStorageModule } from '../object-storage/object-storage.module.js';
import { ImageApiService } from './image-api.service.js';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

@Module({
  imports: [ObjectStorageModule],
  controllers: [ImagesController],
  providers: [DatabaseService, ImageApiService, ImagesService],
})
export class ImagesModule {}
