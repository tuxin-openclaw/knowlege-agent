import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ModelComparisonController } from './model-comparison.controller.js';
import type { ModelUsageService } from '../model-usage/model-usage.service.js';
import type { ModelConfigService } from '../model-config/model-config.service.js';
const usage = {
  begin: vi.fn().mockResolvedValue('call-id'),
  finish: vi.fn().mockResolvedValue(undefined),
} as unknown as ModelUsageService;

const create = vi.hoisted(() => vi.fn());
vi.mock('openai', () => {
  class MockOpenAI {
    static APIError = class extends Error {
      status = 400;
    };
    chat = { completions: { create } };
  }
  return { default: MockOpenAI };
});

function response() {
  const res = new EventEmitter() as Response & {
    chunks: string[];
    statusCode: number;
  };
  res.chunks = [];
  res.status = vi.fn((status: number) => {
    res.statusCode = status;
    return res;
  }) as any;
  res.json = vi.fn() as any;
  res.setHeader = vi.fn() as any;
  res.flushHeaders = vi.fn();
  res.write = vi.fn((chunk: string) => {
    res.chunks.push(chunk);
    return true;
  }) as any;
  res.end = vi.fn() as any;
  return res;
}
const input = {
  threadId: 'thread',
  runId: 'run',
  messages: [{ role: 'user', content: '你好' }],
  state: { temperature: 0.4, top_p: 0.8 },
};
/** 模型来自页面配置，测试用固定配置替身代替数据库查询。 */
function configs(overrides: Record<string, unknown> = {}) {
  return {
    resolve: vi.fn().mockResolvedValue({
      id: '00000001-1111-4111-8111-111111111111',
      kind: 'text',
      name: '测试模型',
      baseUrl: 'http://localhost/v1',
      model: 'model',
      apiKey: 'test',
      streamIncludeUsage: true,
      ...overrides,
    }),
  } as unknown as ModelConfigService;
}

describe('model comparison AG-UI stream', () => {
  beforeEach(() => {
    // 用例共享同一组 mock，开始前清空调用记录，避免断言被上一个用例污染。
    vi.clearAllMocks();
  });
  it('passes only the prompt and selected parameters and streams ordered events', async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: '你' } }] };
        yield { choices: [{ delta: { content: '好' } }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })(),
    );
    const res = response();
    await new ModelComparisonController(configs(), usage).run(input, res);
    expect(create.mock.calls.at(-1)?.[0]).toMatchObject({
      model: 'model',
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.4,
      top_p: 0.8,
      stream: true,
    });
    const events = res.chunks.map((chunk) => JSON.parse(chunk.slice(6)));
    expect(events.map((event) => event.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(
      events
        .filter((event) => event.delta)
        .map((event) => event.delta)
        .join(''),
    ).toBe('你好');
  });
  it('uses the task selected model and the configured usage reporting', async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })(),
    );
    const models = configs({ model: 'other-model' });
    await new ModelComparisonController(models, usage).run(
      {
        ...input,
        state: {
          ...input.state,
          modelId: '00000002-1111-4111-8111-111111111111',
        },
      },
      response(),
    );
    expect(models.resolve).toHaveBeenCalledWith(
      'text',
      '00000002-1111-4111-8111-111111111111',
    );
    expect(create.mock.calls.at(-1)?.[0]).toMatchObject({
      model: 'other-model',
      stream_options: { include_usage: true },
    });
  });
  it('omits usage reporting when the model config disables it', async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })(),
    );
    await new ModelComparisonController(
      configs({ streamIncludeUsage: false }),
      usage,
    ).run(input, response());
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('stream_options');
  });
  it('reports a missing or deleted model before starting the stream', async () => {
    const missing = configs();
    (missing.resolve as any).mockRejectedValue(
      new NotFoundException('选择的模型配置不存在或已被删除，请重新选择'),
    );
    const res = response();
    create.mockClear();
    await new ModelComparisonController(missing, usage).run(input, res);
    expect(res.statusCode).toBe(404);
    expect(res.json).toHaveBeenCalledWith({
      message: '选择的模型配置不存在或已被删除，请重新选择',
    });
    expect(res.chunks).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
    expect(usage.begin).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'passes the task thinking setting %s to the model',
    async (thinking) => {
      create.mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })(),
      );
      const res = response();
      await new ModelComparisonController(configs(), usage).run(
        { ...input, state: { ...input.state, thinking } },
        res,
      );
      expect(create.mock.calls.at(-1)?.[0]).toMatchObject({
        thinking: { type: thinking ? 'enabled' : 'disabled' },
      });
    },
  );
  it('rejects invalid thinking settings', async () => {
    const res = response();
    await new ModelComparisonController(configs(), usage).run(
      { ...input, state: { ...input.state, thinking: 'false' } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });
  it('continues collecting usage after the client disconnects', async () => {
    const res = response();
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: 'a' } }] };
        res.emit('close');
        yield {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            prompt_tokens_details: { cached_tokens: 2 },
          },
        };
      })(),
    );
    await new ModelComparisonController(configs(), usage).run(input, res);
    expect(usage.finish).toHaveBeenLastCalledWith('call-id', 'succeeded', {
      input: 10,
      output: 5,
      total: 15,
      cached: 2,
      reasoning: undefined,
    });
  });
  it('does not call the model if the initial monitoring record fails', async () => {
    const unavailable = {
      begin: vi.fn().mockRejectedValue(new Error('db offline')),
      finish: vi.fn(),
    } as unknown as ModelUsageService;
    create.mockClear();
    await expect(
      new ModelComparisonController(configs(), unavailable).run(
        input,
        response(),
      ),
    ).rejects.toThrow('db offline');
    expect(create).not.toHaveBeenCalled();
  });
  it('reports truncated streams as errors', async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: 'partial' } }] };
      })(),
    );
    const res = response();
    await new ModelComparisonController(configs(), usage).run(input, res);
    expect(res.chunks.join('')).toContain('RUN_ERROR');
    expect(res.chunks.join('')).not.toContain('RUN_FINISHED');
  });
  it('rejects invalid inputs and unconfigured models before streaming', async () => {
    const invalid = response();
    await new ModelComparisonController(configs(), usage).run(
      { ...input, state: { temperature: 3, top_p: 1 } },
      invalid,
    );
    expect(invalid.statusCode).toBe(400);
    const wrongModelId = response();
    await new ModelComparisonController(configs(), usage).run(
      { ...input, state: { ...input.state, modelId: 42 } },
      wrongModelId,
    );
    expect(wrongModelId.statusCode).toBe(400);
    const unconfigured = configs();
    (unconfigured.resolve as any).mockRejectedValue(
      new ServiceUnavailableException(
        '尚未配置文本模型，请先在“模型配置”页面添加',
      ),
    );
    const missing = response();
    await new ModelComparisonController(unconfigured, usage).run(
      input,
      missing,
    );
    expect(missing.statusCode).toBe(503);
  });
});
