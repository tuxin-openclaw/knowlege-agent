import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ObjectStorageAdapter } from './object-storage.types.js';
import { ObjectStorageService } from './object-storage.service.js';

const file = {
  originalname: '../../demo.txt',
  mimetype: 'text/plain',
  size: 5,
  buffer: Buffer.from('hello'),
} as Express.Multer.File;

describe('ObjectStorageService', () => {
  const configuration = {
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-id',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-key',
    OBJECT_STORAGE_BUCKET: 'demo-bucket',
    OBJECT_STORAGE_REGION: 'ap-guangzhou',
  };
  const adapter: ObjectStorageAdapter = {
    upload: vi.fn().mockResolvedValue('test-etag'),
    createDownloadUrl: vi.fn().mockResolvedValue('https://example.test/signed'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adapter.upload).mockResolvedValue('test-etag');
    vi.mocked(adapter.createDownloadUrl).mockResolvedValue(
      'https://example.test/signed',
    );
  });

  it('reports missing configuration and does not call the adapter', async () => {
    const service = new ObjectStorageService(new ConfigService({}), adapter);
    expect(service.getStatus()).toMatchObject({
      configured: false,
      missing: expect.arrayContaining(['OBJECT_STORAGE_BUCKET']),
    });
    await expect(service.upload(file)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(adapter.upload).not.toHaveBeenCalled();
  });

  it('stores a generated object key and creates a five-minute download URL', async () => {
    const service = new ObjectStorageService(
      new ConfigService(configuration),
      adapter,
    );
    const result = await service.upload(file);
    expect(adapter.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^upload-tests\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.txt$/,
        ),
        body: file.buffer,
        size: file.size,
        contentType: file.mimetype,
      }),
    );
    expect(adapter.createDownloadUrl).toHaveBeenCalledWith(result.key, 300);
    expect(result.etag).toBe('test-etag');
    expect(result.url).toBe('https://example.test/signed');
  });

  it('converts adapter failures into an actionable error', async () => {
    vi.mocked(adapter.upload).mockRejectedValue(
      new Error('private adapter details'),
    );
    const service = new ObjectStorageService(
      new ConfigService(configuration),
      adapter,
    );
    await expect(service.upload(file)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(adapter.createDownloadUrl).not.toHaveBeenCalled();
  });
});
