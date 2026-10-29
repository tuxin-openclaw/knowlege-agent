import { Body, Controller, HttpException, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { ModelUsageService } from '../model-usage/model-usage.service.js';
import {
  ModelConfigService,
  type ResolvedModelConfig,
} from '../model-config/model-config.service.js';

@Controller('api/model-comparison')
export class ModelComparisonController {
  constructor(
    private readonly configs: ModelConfigService,
    private readonly usage: ModelUsageService,
  ) {}

  @Post('run')
  async run(@Body() input: any, @Res() res: Response) {
    const prompt = Array.isArray(input?.messages)
      ? input.messages.filter((message: any) => message?.role === 'user').at(-1)
          ?.content
      : undefined;
    const { temperature, top_p, thinking, modelId } = input?.state ?? {};
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.length > 20000 ||
      typeof temperature !== 'number' ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2 ||
      typeof top_p !== 'number' ||
      !Number.isFinite(top_p) ||
      top_p < 0 ||
      top_p > 1 ||
      (thinking !== undefined && typeof thinking !== 'boolean') ||
      (modelId !== undefined && typeof modelId !== 'string') ||
      typeof input?.threadId !== 'string' ||
      typeof input?.runId !== 'string'
    ) {
      res.status(400).json({ message: '请输入有效的提示词和模型参数' });
      return;
    }
    // 模型由页面维护：未选择时使用默认文本模型，选择已删除的模型时明确报错。
    let model: ResolvedModelConfig;
    try {
      model = await this.configs.resolve('text', modelId);
    } catch (error) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json({ message: error.message });
        return;
      }
      throw error;
    }
    const callId = await this.usage.begin('text', model.baseUrl, model.model);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: object) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    // 页面断开后继续消费上游流，尽可能获取最终计费用量。
    const messageId = randomUUID();
    send({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
    let finalStatus: 'succeeded' | 'failed' | 'unknown' = 'unknown';
    let reportedUsage: {
      input?: number;
      output?: number;
      total?: number;
      cached?: number;
      reasoning?: number;
    } = {};
    try {
      const client = new OpenAI({
        apiKey: model.apiKey,
        baseURL: model.baseUrl,
        maxRetries: 0,
      });
      const stream = await client.chat.completions.create({
        model: model.model,
        messages: [{ role: 'user', content: prompt.trim() }],
        temperature,
        top_p,
        ...(thinking === undefined
          ? {}
          : { thinking: { type: thinking ? 'enabled' : 'disabled' } }),
        stream: true,
        ...(model.streamIncludeUsage
          ? { stream_options: { include_usage: true } }
          : {}),
      });
      send({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
      let finished = false;
      for await (const chunk of stream) {
        if (chunk.usage) {
          const u = chunk.usage as typeof chunk.usage & {
            prompt_cache_hit_tokens?: number;
          };
          reportedUsage = {
            input: u.prompt_tokens,
            output: u.completion_tokens,
            total: u.total_tokens,
            cached:
              u.prompt_tokens_details?.cached_tokens ??
              u.prompt_cache_hit_tokens,
            reasoning: u.completion_tokens_details?.reasoning_tokens,
          };
        }
        if (chunk.choices[0]?.finish_reason) finished = true;
        const delta = chunk.choices[0]?.delta.content;
        if (delta) send({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta });
      }
      if (!finished)
        throw new Error('Model stream ended without a finish reason');
      finalStatus = 'succeeded';
      send({ type: 'TEXT_MESSAGE_END', messageId });
      send({
        type: 'RUN_FINISHED',
        threadId: input.threadId,
        runId: input.runId,
      });
    } catch (error) {
      const status =
        error instanceof OpenAI.APIError ? error.status : undefined;
      if (status && status >= 400 && status < 500) finalStatus = 'failed';
      send({
        type: 'RUN_ERROR',
        message:
          status === 400
            ? '模型不支持当前请求或参数，请检查参数及模型配置'
            : '模型请求失败，请检查模型配置和服务状态',
        code: status ? String(status) : 'MODEL_ERROR',
      });
    } finally {
      await this.usage.finish(callId, finalStatus, reportedUsage);
      if (!res.destroyed) res.end();
    }
  }
}
