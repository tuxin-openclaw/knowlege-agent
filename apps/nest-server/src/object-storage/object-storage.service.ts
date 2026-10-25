import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  OBJECT_STORAGE_ADAPTER,
  type ObjectStorageAdapter,
} from './object-storage.types.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_EXPIRES_SECONDS = 300;
const REQUIRED_KEYS = [
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_REGION',
] as const;

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE_ADAPTER)
    private readonly adapter: ObjectStorageAdapter,
  ) {}

  getStatus() {
    const missing = REQUIRED_KEYS.filter(
      (key) => !this.config.get<string>(key)?.trim(),
    );
    return {
      configured: missing.length === 0,
      missing,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    };
  }

  async upload(file: Express.Multer.File) {
    const status = this.getStatus();
    if (!status.configured) {
      throw new ServiceUnavailableException(
        `请在 nest-server/.env 配置 ${status.missing.join('、')}，然后重启服务`,
      );
    }

    const extension = extname(file.originalname)
      .replace(/[^a-zA-Z0-9.]/g, '')
      .slice(0, 16);
    const key = `upload-tests/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
    try {
      const etag = await this.adapter.upload({
        key,
        body: file.buffer,
        size: file.size,
        contentType: file.mimetype || 'application/octet-stream',
        fileName: file.originalname,
      });
      const url = await this.adapter.createDownloadUrl(
        key,
        DOWNLOAD_EXPIRES_SECONDS,
      );
      return {
        key,
        name: file.originalname,
        size: file.size,
        etag,
        url,
        expiresIn: DOWNLOAD_EXPIRES_SECONDS,
      };
    } catch {
      this.logger.error(
        '对象存储上传失败，请检查服务端凭证、Endpoint、地域及对象读写权限',
      );
      throw new BadGatewayException(
        '对象存储上传失败，请检查凭证、存储桶、Endpoint、地域及 PutObject / GetObject 权限',
      );
    }
  }
}
