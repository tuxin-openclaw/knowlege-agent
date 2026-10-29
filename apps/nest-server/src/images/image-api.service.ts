import { BadGatewayException, Injectable } from '@nestjs/common';
import { ModelUsageService } from '../model-usage/model-usage.service.js';
import { ModelConfigService } from '../model-config/model-config.service.js';

export const MAX_RESULT_BYTES = 30 * 1024 * 1024;

export function imageFormat(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && Buffer.from(bytes.slice(1, 4)).toString() === 'PNG')
    return { type: 'image/png', extension: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { type: 'image/jpeg', extension: 'jpg' };
  if (
    Buffer.from(bytes.slice(0, 4)).toString() === 'RIFF' &&
    Buffer.from(bytes.slice(8, 12)).toString() === 'WEBP'
  )
    return { type: 'image/webp', extension: 'webp' };
  throw new BadGatewayException('图片格式不受支持，请使用 PNG、JPEG 或 WebP');
}

@Injectable()
export class ImageApiService {
  constructor(
    private readonly configs: ModelConfigService,
    private readonly usage: ModelUsageService,
  ) {}

  /**
   * 读取当前可用的生图模型（不解密密钥）。
   * 指定 id 已被删除时回退到默认生图模型，便于页面持有旧 id 时继续提交任务。
   */
  async getConfiguration(modelId?: string) {
    const model = await this.configs.summary('image', modelId);
    return {
      configured: model.configured,
      modelId: model.id,
      name: model.name,
      model: model.model,
    };
  }

  /**
   * 调用上游生图接口并返回图片字节。
   * 配置、密钥或监控记录任一不可用时都不会发起上游请求，避免产生无记录的付费调用。
   * @param modelConfigId 页面指定的生图模型；不传或已失效时使用默认模型。
   */
  async generate(
    prompt: string,
    modelConfigId?: string | null,
    reference?: { bytes: Uint8Array; contentType: string },
  ) {
    const config = await this.configs.resolve('image', modelConfigId);
    const model = config.model;
    const base = config.baseUrl.trim().replace(/\/+$/, '');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey.trim()}`,
    };
    let body: string | FormData;
    let path: string;
    const isArk = /^ark\.[a-z0-9-]+\.volces\.com$/.test(new URL(base).hostname);
    if (isArk) {
      // 方舟的文生图和参考图编辑共用 JSON 接口，不支持 /images/edits。
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({
        model,
        prompt,
        ...(reference
          ? {
              image: `data:${imageFormat(reference.bytes).type};base64,${Buffer.from(reference.bytes).toString('base64')}`,
            }
          : {}),
        size: '2K',
        sequential_image_generation: 'disabled',
        response_format: 'b64_json',
      });
      path = '/images/generations';
    } else if (reference) {
      const format = imageFormat(reference.bytes);
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append(
        'image',
        new Blob([new Uint8Array(reference.bytes)], { type: format.type }),
        `reference.${format.extension}`,
      );
      body = form;
      path = '/images/edits';
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ model, prompt, n: 1 });
      path = '/images/generations';
    }
    // Some providers return temporary URLs, others return b64_json. Both are persisted to COS.
    const callId = await this.usage.begin('image', base, model);
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(180000),
      });
    } catch {
      await this.usage.finish(callId, 'unknown');
      throw new BadGatewayException('生图服务连接失败或超时，请稍后重试');
    }
    if (!response.ok) {
      await this.usage.finish(
        callId,
        response.status >= 400 && response.status < 500 ? 'failed' : 'unknown',
      );
      const failure = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      if (failure?.error?.code === 'InvalidEndpointOrModel.NotFound') {
        throw new BadGatewayException(
          `生图模型 ${model} 不存在或当前 API Key 无权访问，请检查“模型配置”中的模型名称和方舟模型权限`,
        );
      }
      if (failure?.error?.code === 'ModelNotOpen') {
        throw new BadGatewayException('请先在火山方舟控制台开通当前生图模型');
      }
      const message =
        response.status === 401 || response.status === 403
          ? '生图服务鉴权失败，请检查“模型配置”中的 API Key'
          : response.status === 429
            ? '生图服务限流或额度不足，请稍后重试'
            : `生图服务返回错误（${response.status}），请检查模型和接口配置`;
      throw new BadGatewayException(message);
    }
    let payload: { data?: { b64_json?: string; url?: string }[] };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      await this.usage.finish(callId, 'unknown');
      throw new BadGatewayException('生图服务返回了无法识别的数据');
    }
    // 只统计上游明确返回的图片数量，后续下载或存储失败不改变模型调用结果。
    await this.usage.finish(callId, 'succeeded', {
      images:
        Array.isArray(payload.data) &&
        payload.data.every(
          (item) =>
            item &&
            (typeof item.b64_json === 'string' || typeof item.url === 'string'),
        )
          ? payload.data.length
          : null,
    });
    const image = payload.data?.[0];
    let bytes: Uint8Array;
    if (image?.b64_json) {
      if (image.b64_json.length > (MAX_RESULT_BYTES * 4) / 3 + 4)
        throw new BadGatewayException('生成图片超过 30 MB');
      bytes = Buffer.from(image.b64_json, 'base64');
    } else if (image?.url) {
      const url = new URL(image.url);
      if (url.protocol !== 'https:')
        throw new BadGatewayException('生图服务必须返回 HTTPS 图片链接');
      const download = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!download.ok || !download.body)
        throw new BadGatewayException('下载生成图片失败');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of download.body) {
        size += chunk.length;
        if (size > MAX_RESULT_BYTES)
          throw new BadGatewayException('生成图片超过 30 MB');
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    } else {
      throw new BadGatewayException(
        '生图服务没有返回图片，请确认使用 OpenAI 兼容图片接口',
      );
    }
    if (!bytes.length || bytes.length > MAX_RESULT_BYTES)
      throw new BadGatewayException('生成图片为空或超过 30 MB');
    return { bytes, ...imageFormat(bytes) };
  }
}
