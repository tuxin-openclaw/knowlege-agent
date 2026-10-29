import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ObjectStorageModule } from './object-storage/object-storage.module.js';
import { ImagesModule } from './images/images.module.js';
import { ModelComparisonModule } from './model-comparison/model-comparison.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
    }),
    ObjectStorageModule,
    ImagesModule,
    ModelComparisonModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
