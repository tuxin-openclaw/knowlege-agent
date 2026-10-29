import { Body, Controller, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

@Controller('api/model-comparison')
export class ModelComparisonController {
  constructor(private readonly config: ConfigService) {}

  @Post('run')
  async run(@Body() input: any, @Res() res: Response) {
    const prompt = Array.isArray(input?.messages)
      ? input.messages.filter((message: any) => message?.role === 'user').at(-1)
          ?.content
      : undefined;
    const { temperature, top_p, thinking } = input?.state ?? {};
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
      typeof input?.threadId !== 'string' ||
      typeof input?.runId !== 'string'
    ) {
      res.status(400).json({ message: '请输入有效的提示词和模型参数' });
      return;
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL');
    const model = this.config.get<string>('OPENAI_MODEL_NAME');
    if (!apiKey || !baseURL || !model) {
      res
        .status(503)
        .json({ message: '模型配置不完整，请检查服务端 OPENAI 配置' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: object) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', onClose);
    const messageId = randomUUID();
    send({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
    try {
      const client = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
      const stream = await client.chat.completions.create(
        {
          model,
          messages: [{ role: 'user', content: prompt.trim() }],
          temperature,
          top_p,
          ...(thinking === undefined
            ? {}
            : { thinking: { type: thinking ? 'enabled' : 'disabled' } }),
          stream: true,
        },
        { signal: abort.signal },
      );
      send({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
      let finished = false;
      for await (const chunk of stream) {
        if (chunk.choices[0]?.finish_reason) finished = true;
        const delta = chunk.choices[0]?.delta.content;
        if (delta) send({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta });
      }
      if (!finished)
        throw new Error('Model stream ended without a finish reason');
      send({ type: 'TEXT_MESSAGE_END', messageId });
      send({
        type: 'RUN_FINISHED',
        threadId: input.threadId,
        runId: input.runId,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        const status =
          error instanceof OpenAI.APIError ? error.status : undefined;
        send({
          type: 'RUN_ERROR',
          message:
            status === 400
              ? '模型不支持当前请求或参数，请检查参数及模型配置'
              : '模型请求失败，请检查模型配置和服务状态',
          code: status ? String(status) : 'MODEL_ERROR',
        });
      }
    } finally {
      res.off('close', onClose);
      if (!res.destroyed) res.end();
    }
  }
}
