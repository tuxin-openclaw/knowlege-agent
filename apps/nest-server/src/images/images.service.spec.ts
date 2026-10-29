import { ImagesService } from './images.service.js';
import type { DatabaseService } from '../database/database.service.js';
import type { ObjectStorageService } from '../object-storage/object-storage.service.js';
import type { ImageApiService } from './image-api.service.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=',
  'base64',
);
const temporary =
  'knowlege-agent/tmp/2026-10-26/12345678-1234-1234-1234-123456789012.png';
const permanent =
  'knowlege-agent/references/12345678-1234-1234-1234-123456789012.png';
const legacy =
  'upload-tests/2026-10-26/12345678-1234-1234-1234-123456789012.png';
const MODEL_ID = '00000001-1111-4111-8111-111111111111';

function setup() {
  const db = {
    isReady: vi.fn().mockResolvedValue(true),
    query: vi
      .fn()
      .mockImplementation(async (_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: params[0],
            prompt: params[1],
            reference_key: params[2],
            model_name: params[3],
            model_config_id: params[4],
            result_key: null,
            status: 'queued',
            error_message: null,
            created_at: new Date(),
          },
        ],
      })),
  };
  const storage = {
    getStatus: () => ({ configured: true }),
    readImage: vi
      .fn()
      .mockResolvedValue({ bytes: png, contentType: 'image/png' }),
    saveImage: vi.fn().mockResolvedValue(undefined),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    createPreviewUrl: vi
      .fn()
      .mockImplementation(async (key: string) => `https://images.test/${key}`),
  };
  const api = {
    getConfiguration: vi.fn().mockResolvedValue({
      configured: true,
      modelId: MODEL_ID,
      name: '生图模型',
      model: 'test-model',
    }),
    generate: vi.fn(),
  };
  const service = new ImagesService(
    db as unknown as DatabaseService,
    storage as unknown as ObjectStorageService,
    api as unknown as ImageApiService,
  );
  return { service, db, storage, api };
}

describe('reference image lifecycle', () => {
  it('copies a temporary reference before storing its permanent key', async () => {
    const { service, db, storage } = setup();
    const result = await service.create({
      prompt: '背景换成公园',
      referenceKey: temporary,
    });
    expect(result.referenceKey).toBe(
      `knowlege-agent/references/${result.id}.png`,
    );
    expect(storage.saveImage).toHaveBeenCalledWith(
      result.referenceKey,
      png,
      'image/png',
    );
    expect(db.query.mock.calls[0][1][2]).toBe(result.referenceKey);
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });

  it('records the selected image model with the queued task', async () => {
    const { service, db, api } = setup();
    const result = await service.create({
      prompt: '公园',
      modelId: MODEL_ID,
    });
    expect(api.getConfiguration).toHaveBeenCalledWith(MODEL_ID);
    expect(db.query.mock.calls[0][1]).toEqual([
      result.id,
      '公园',
      null,
      'test-model',
      MODEL_ID,
    ]);
    expect(result).toMatchObject({ model: 'test-model', modelId: MODEL_ID });
  });

  it('refuses to queue when no image model is configured', async () => {
    const { service, db, api } = setup();
    api.getConfiguration.mockResolvedValueOnce({
      configured: false,
      modelId: null,
      name: null,
      model: null,
    });
    await expect(service.create({ prompt: '公园' })).rejects.toThrow(
      '尚未配置生图模型，请先在“模型配置”页面添加',
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a non-string model selection', async () => {
    const { service } = setup();
    await expect(
      service.create({ prompt: '公园', modelId: 42 }),
    ).rejects.toThrow('生图模型选择无效');
  });

  it.each([permanent, legacy])(
    'keeps an existing reference usable: %s',
    async (referenceKey) => {
      const { service, storage } = setup();
      const result = await service.create({ prompt: '公园', referenceKey });
      expect(result.referenceKey).toBe(referenceKey);
      expect(storage.saveImage).not.toHaveBeenCalled();
    },
  );

  it('does not queue a task if the permanent copy fails', async () => {
    const { service, db, storage } = setup();
    storage.saveImage.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      service.create({ prompt: '公园', referenceKey: temporary }),
    ).rejects.toThrow('参考图保存失败');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('removes the permanent copy only after confirming the insert did not commit', async () => {
    const { service, db, storage } = setup();
    db.query
      .mockRejectedValueOnce(new Error('insert failed'))
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.create({ prompt: '公园', referenceKey: temporary }),
    ).rejects.toThrow('insert failed');
    expect(storage.deleteImage).toHaveBeenCalledWith(
      storage.saveImage.mock.calls[0][0],
    );
  });

  it('keeps the permanent copy if a failed insert response actually committed', async () => {
    const { service, db, storage } = setup();
    db.query
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ rows: [{ id: 'saved' }] });
    await expect(
      service.create({ prompt: '公园', referenceKey: temporary }),
    ).rejects.toThrow('response lost');
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });
});
