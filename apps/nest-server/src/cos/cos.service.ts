import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_EXPIRES_SECONDS = 300;
const REQUIRED_KEYS = [
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'COS_REGION',
] as const;

@Injectable()
export class CosService {
  private readonly logger = new Logger(CosService.name);

  constructor(private readonly config: ConfigService) {}

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

    const bucket = this.config.getOrThrow<string>('COS_BUCKET').trim();
    const region = this.config.getOrThrow<string>('COS_REGION').trim();
    const cos = new COS({
      SecretId: this.config.getOrThrow<string>('COS_SECRET_ID').trim(),
      SecretKey: this.config.getOrThrow<string>('COS_SECRET_KEY').trim(),
      SecurityToken:
        this.config.get<string>('COS_SECURITY_TOKEN')?.trim() || undefined,
      Protocol: 'https:',
      Timeout: 60_000,
    });
    // Generate the object key ourselves so file names cannot overwrite other objects.
    const extension = extname(file.originalname)
      .replace(/[^a-zA-Z0-9.]/g, '')
      .slice(0, 16);
    const key = `upload-tests/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;

    try {
      const result = await cos.putObject({
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: file.buffer,
        ContentLength: file.size,
        ContentType: file.mimetype || 'application/octet-stream',
        ContentDisposition: 'attachment',
      });
      const url = cos.getObjectUrl({
        Bucket: bucket,
        Region: region,
        Key: key,
        Sign: true,
        Expires: DOWNLOAD_EXPIRES_SECONDS,
      });
      return {
        key,
        name: file.originalname,
        size: file.size,
        etag: result.ETag,
        url,
        expiresIn: DOWNLOAD_EXPIRES_SECONDS,
      };
    } catch {
      this.logger.error(
        'COS 上传失败，请检查服务端密钥、存储桶地域及对象读写权限',
      );
      throw new BadGatewayException(
        'COS 上传失败，请检查密钥、存储桶名称、地域及 cos:PutObject / cos:GetObject 权限',
      );
    }
  }
}
