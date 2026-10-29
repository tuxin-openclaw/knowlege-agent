import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import { ModelComparisonController } from './model-comparison.controller.js';

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
const config = {
  get: (key: string) =>
    ({
      OPENAI_API_KEY: 'test',
      OPENAI_BASE_URL: 'http://localhost/v1',
      OPENAI_MODEL_NAME: 'model',
    })[key],
} as ConfigService;

describe('model comparison AG-UI stream', () => {
  it('passes only the prompt and selected parameters and streams ordered events', async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: '你' } }] };
        yield { choices: [{ delta: { content: '好' } }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })(),
    );
    const res = response();
    await new ModelComparisonController(config).run(input, res);
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
  it.each([true, false])(
    'passes the task thinking setting %s to the model',
    async (thinking) => {
      create.mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })(),
      );
      const res = response();
      await new ModelComparisonController(config).run(
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
    await new ModelComparisonController(config).run(
      { ...input, state: { ...input.state, thinking: 'false' } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });
  it('reports truncated streams as errors', async () => {
    create.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: 'partial' } }] };
      })(),
    );
    const res = response();
    await new ModelComparisonController(config).run(input, res);
    expect(res.chunks.join('')).toContain('RUN_ERROR');
    expect(res.chunks.join('')).not.toContain('RUN_FINISHED');
  });
  it('rejects invalid inputs and missing configuration before streaming', async () => {
    const invalid = response();
    await new ModelComparisonController(config).run(
      { ...input, state: { temperature: 3, top_p: 1 } },
      invalid,
    );
    expect(invalid.statusCode).toBe(400);
    const missing = response();
    await new ModelComparisonController({
      get: () => undefined,
    } as unknown as ConfigService).run(input, missing);
    expect(missing.statusCode).toBe(503);
  });
});
