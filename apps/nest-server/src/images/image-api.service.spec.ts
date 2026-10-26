import { ConfigService } from '@nestjs/config';
import { ImageApiService } from './image-api.service.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=',
  'base64',
);
const service = () =>
  new ImageApiService(
    new ConfigService({
      IMAGE_API_KEY: 'test-key',
      IMAGE_BASE_URL: 'https://provider.test/v1/',
      IMAGE_MODEL_NAME: 'test-model',
    }),
  );
afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible image protocol', () => {
  it.each([false, true])(
    'uses Ark JSON generation with reference=%s',
    async (withReference) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: [{ b64_json: png.toString('base64') }] }),
        );
      vi.stubGlobal('fetch', fetcher);
      const ark = new ImageApiService(
        new ConfigService({
          IMAGE_API_KEY: 'test-key',
          IMAGE_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3/',
          IMAGE_MODEL_NAME: 'doubao-seedream-4-0-250828',
        }),
      );
      const image = await ark.generate(
        '背景换成公园',
        'doubao-seedream-4-0-250828',
        withReference ? { bytes: png, contentType: 'image/png' } : undefined,
      );
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(
        'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      );
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({
        model: 'doubao-seedream-4-0-250828',
        prompt: '背景换成公园',
        ...(withReference
          ? { image: `data:image/png;base64,${png.toString('base64')}` }
          : {}),
        size: '2K',
        sequential_image_generation: 'disabled',
        response_format: 'b64_json',
      });
      expect(Buffer.from(image.bytes)).toEqual(png);
    },
  );

  it('accepts a Base64 result from text generation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ b64_json: png.toString('base64') }] }),
      );
    vi.stubGlobal('fetch', fetcher);
    const image = await service().generate('画一只猫', 'test-model');
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://provider.test/v1/images/generations',
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      prompt: '画一只猫',
      model: 'test-model',
      n: 1,
    });
    expect(Buffer.from(image.bytes)).toEqual(png);
    expect(image.type).toBe('image/png');
  });

  it('sends reference bytes as multipart and persists a URL result as image bytes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ url: 'https://cdn.provider.test/result.png' }],
        }),
      )
      .mockResolvedValueOnce(new Response(png));
    vi.stubGlobal('fetch', fetcher);
    const image = await service().generate('换成水彩风格', 'test-model', {
      bytes: png,
      contentType: 'image/png',
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://provider.test/v1/images/edits');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('prompt')).toBe('换成水彩风格');
    expect(Buffer.from(await init.body.get('image').arrayBuffer())).toEqual(
      png,
    );
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(image.bytes).toEqual(png);
  });

  it('reports authentication errors without disclosing provider response details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('private-provider-details', { status: 401 }),
        ),
    );
    await expect(service().generate('cat', 'test-model')).rejects.toThrow(
      '生图服务鉴权失败',
    );
  });

  it('rejects a successful response without an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [] })),
    );
    await expect(service().generate('cat', 'test-model')).rejects.toThrow(
      '生图服务没有返回图片',
    );
  });

  it('explains model access failures without leaking the upstream message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'InvalidEndpointOrModel.NotFound',
              message: 'private-provider-details',
            },
          },
          { status: 404 },
        ),
      ),
    );
    await expect(service().generate('cat', 'test-model')).rejects.toThrow(
      '生图模型 test-model 不存在或当前 API Key 无权访问',
    );
  });
});
