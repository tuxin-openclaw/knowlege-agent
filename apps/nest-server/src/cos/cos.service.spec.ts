import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CosService } from './cos.service.js';

const { putObject, getObjectUrl } = vi.hoisted(() => ({
  putObject: vi.fn(),
  getObjectUrl: vi.fn(),
}));

vi.mock('cos-nodejs-sdk-v5', () => ({
  default: class {
    putObject = putObject;
    getObjectUrl = getObjectUrl;
  },
}));

const file = {
  originalname: '../../demo.txt',
  mimetype: 'text/plain',
  size: 5,
  buffer: Buffer.from('hello'),
} as Express.Multer.File;

describe('COS uploads', () => {
  const configuration = {
    COS_SECRET_ID: 'test-id',
    COS_SECRET_KEY: 'test-key',
    COS_BUCKET: 'demo-1250000000',
    COS_REGION: 'ap-guangzhou',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    putObject.mockResolvedValue({ ETag: 'test-etag' });
    getObjectUrl.mockReturnValue('https://example.test/file?signature=test');
  });

  it('reports missing configuration without exposing credentials', async () => {
    const service = new CosService(new ConfigService({}));
    expect(service.getStatus().configured).toBe(false);
    await expect(service.upload(file)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(putObject).not.toHaveBeenCalled();
    expect(
      new CosService(new ConfigService(configuration)).getStatus(),
    ).toEqual({
      configured: true,
      missing: [],
      maxUploadBytes: 10 * 1024 * 1024,
    });
  });

  it('uploads the original bytes under a generated key and signs a five-minute download', async () => {
    const service = new CosService(new ConfigService(configuration));
    const result = await service.upload(file);
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: configuration.COS_BUCKET,
        Region: configuration.COS_REGION,
        Key: expect.stringMatching(
          /^upload-tests\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.txt$/,
        ),
        Body: file.buffer,
        ContentType: 'text/plain',
        ContentDisposition: 'attachment',
      }),
    );
    expect(getObjectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: result.key,
        Sign: true,
        Expires: 300,
      }),
    );
    expect(result.etag).toBe('test-etag');
    expect(result.url).toBe('https://example.test/file?signature=test');
  });

  it('converts SDK failures into an actionable error without exposing the SDK error', async () => {
    putObject.mockRejectedValue(new Error('sensitive SDK details'));
    const service = new CosService(new ConfigService(configuration));
    await expect(service.upload(file)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(getObjectUrl).not.toHaveBeenCalled();
  });
});
