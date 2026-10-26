import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ObjectStorageAdapter } from './object-storage.types.js';
import { ObjectStorageService } from './object-storage.service.js';

const file = { name: '../../demo.txt', contentType: 'text/plain', size: 5 };

describe('ObjectStorageService', () => {
  const configuration = {
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-id',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-key',
    OBJECT_STORAGE_BUCKET: 'demo-bucket',
    OBJECT_STORAGE_REGION: 'ap-guangzhou',
  };
  const adapter: ObjectStorageAdapter = {
    createPreviewUrl: vi.fn(),
    readImage: vi.fn(),
    saveImage: vi.fn(),
    deleteImage: vi.fn(),
    createUploadUrl: vi.fn().mockResolvedValue('https://example.test/put'),
    createDownloadUrl: vi.fn().mockResolvedValue('https://example.test/signed'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adapter.createUploadUrl).mockResolvedValue(
      'https://example.test/put',
    );
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
    await expect(service.createUpload(file)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(adapter.createUploadUrl).not.toHaveBeenCalled();
  });

  it('creates temporary direct-upload and download URLs', async () => {
    const service = new ObjectStorageService(
      new ConfigService(configuration),
      adapter,
    );
    const result = await service.createUpload(file);
    expect(adapter.createUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(
        /^knowlege-agent\/tmp\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.txt$/,
      ),
      'text/plain',
      300,
    );
    expect(adapter.createDownloadUrl).toHaveBeenCalledWith(result.key, 300);
    expect(result.uploadUrl).toBe('https://example.test/put');
    expect(result.url).toBe('https://example.test/signed');
  });

  it('rejects files larger than the configured limit', async () => {
    const service = new ObjectStorageService(
      new ConfigService(configuration),
      adapter,
    );
    await expect(
      service.createUpload({ ...file, size: 10 * 1024 * 1024 + 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(adapter.createUploadUrl).not.toHaveBeenCalled();
  });

  it('converts adapter failures into an actionable error', async () => {
    vi.mocked(adapter.createUploadUrl).mockRejectedValue(
      new Error('private adapter details'),
    );
    const service = new ObjectStorageService(
      new ConfigService(configuration),
      adapter,
    );
    await expect(service.createUpload(file)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(adapter.createDownloadUrl).not.toHaveBeenCalled();
  });
});
