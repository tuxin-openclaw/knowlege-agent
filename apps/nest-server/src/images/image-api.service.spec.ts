import { ImageApiService } from './image-api.service.js';
import type { ModelUsageService } from '../model-usage/model-usage.service.js';
import type { ModelConfigService } from '../model-config/model-config.service.js';
const usage = {
  begin: vi.fn().mockResolvedValue('call-id'),
  finish: vi.fn().mockResolvedValue(undefined),
} as unknown as ModelUsageService;

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=',
  'base64',
);
const MODEL_ID = '00000001-1111-4111-8111-111111111111';

/**
 * 生图模型由页面配置维护，测试用固定的配置替身代替数据库查询。
 * 默认地址保留末尾斜杠，用于覆盖拼接上游路径前的规范化处理。
 */
function api(
  overrides: { baseUrl?: string; model?: string; apiKey?: string } = {},
  usageService: ModelUsageService = usage,
) {
  const resolved = {
    id: MODEL_ID,
    kind: 'image' as const,
    name: '测试生图模型',
    baseUrl: overrides.baseUrl ?? 'https://provider.test/v1/',
    model: overrides.model ?? 'test-model',
    apiKey: overrides.apiKey ?? 'test-key',
    streamIncludeUsage: true,
  };
  const configs = {
    resolve: vi.fn().mockResolvedValue(resolved),
  } as unknown as ModelConfigService;
  return new ImageApiService(configs, usageService);
}
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
      const ark = api({
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/',
        model: 'doubao-seedream-4-0-250828',
      });
      const image = await ark.generate(
        '背景换成公园',
        MODEL_ID,
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

  it('does not call the provider if the monitoring record cannot be written', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const unavailable = {
      begin: vi.fn().mockRejectedValue(new Error('db offline')),
      finish: vi.fn(),
    } as unknown as ModelUsageService;
    await expect(api({}, unavailable).generate('cat')).rejects.toThrow(
      'db offline',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not call the provider when no image model is configured', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const configs = {
      resolve: vi.fn().mockRejectedValue(new Error('no model')),
    } as unknown as ModelConfigService;
    const unavailable = new ImageApiService(configs, usage);
    await expect(unavailable.generate('cat')).rejects.toThrow('no model');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts a Base64 result from text generation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ b64_json: png.toString('base64') }] }),
      );
    vi.stubGlobal('fetch', fetcher);
    const image = await api().generate('画一只猫');
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
    const image = await api().generate('换成水彩风格', undefined, {
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
    await expect(api().generate('cat')).rejects.toThrow('生图服务鉴权失败');
  });

  it('rejects a successful response without an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [] })),
    );
    await expect(api().generate('cat')).rejects.toThrow('生图服务没有返回图片');
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
    await expect(api().generate('cat')).rejects.toThrow(
      '生图模型 test-model 不存在或当前 API Key 无权访问',
    );
  });

  it('reports the configured image model without decrypting the key', async () => {
    const summary = vi.fn().mockResolvedValue({
      configured: true,
      id: MODEL_ID,
      name: '测试生图模型',
      model: 'test-model',
    });
    const service = new ImageApiService(
      { summary } as unknown as ModelConfigService,
      usage,
    );
    await expect(service.getConfiguration()).resolves.toEqual({
      configured: true,
      modelId: MODEL_ID,
      name: '测试生图模型',
      model: 'test-model',
    });
    expect(summary).toHaveBeenCalledWith('image', undefined);
  });
});
