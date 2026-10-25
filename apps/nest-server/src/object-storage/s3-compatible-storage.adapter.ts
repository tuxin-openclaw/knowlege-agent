import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorageAdapter } from './object-storage.types.js';

@Injectable()
export class S3CompatibleStorageAdapter implements ObjectStorageAdapter {
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  createUploadUrl(key: string, contentType: string, expiresIn: number) {
    return getSignedUrl(
      this.getClient(),
      new PutObjectCommand({
        Bucket: this.config.getOrThrow<string>('OBJECT_STORAGE_BUCKET'),
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
  }

  createDownloadUrl(key: string, expiresIn: number) {
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: this.config.getOrThrow<string>('OBJECT_STORAGE_BUCKET'),
        Key: key,
        ResponseContentDisposition: 'attachment',
      }),
      { expiresIn },
    );
  }

  private getClient() {
    if (!this.client) {
      const endpoint = this.config
        .get<string>('OBJECT_STORAGE_ENDPOINT')
        ?.trim();
      const accessKeyId = this.config
        .getOrThrow<string>('OBJECT_STORAGE_ACCESS_KEY_ID')
        .trim();
      const secretAccessKey = this.config
        .getOrThrow<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')
        .trim();
      const sessionToken = this.config
        .get<string>('OBJECT_STORAGE_SESSION_TOKEN')
        ?.trim();
      this.client = new S3Client({
        region: this.config.getOrThrow<string>('OBJECT_STORAGE_REGION').trim(),
        ...(endpoint ? { endpoint } : {}),
        forcePathStyle:
          this.config.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') === 'true',
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {}),
        },
      });
    }
    return this.client;
  }
}
