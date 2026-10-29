import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service.js';
import { ModelConfigService } from './model-config.service.js';
import { ModelUsageService } from '../model-usage/model-usage.service.js';
import { deriveKey, encryptSecret } from './model-config.crypto.js';

type Row = {
  id: string;
  kind: 'text' | 'image';
  name: string;
  base_url: string;
  model: string;
  api_key_cipher: string;
  api_key_hint: string;
  stream_include_usage: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
};

const SECRET = 'test-secret-value-0123456789';
const PLAIN_KEY = 'sk-seed-0001';
/** 生成固定格式的 uuid，便于断言指定 id 的行为。 */
const id = (n: number) =>
  `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

function seed(overrides: Partial<Row> = {}): Row {
  return {
    id: id(1),
    kind: 'text',
    name: '默认文本模型',
    base_url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    api_key_cipher: encryptSecret(PLAIN_KEY, deriveKey(SECRET)),
    api_key_hint: '****0001',
    stream_include_usage: true,
    is_default: true,
    created_at: new Date(1000),
    updated_at: new Date(1000),
    ...overrides,
  };
}

/**
 * 内存版数据库替身：按 model-config.service.ts 实际使用的 SQL 语句更新行数据，
 * 让测试可以验证默认模型的迁移、名称冲突和密钥保留等语义，而不依赖真实 Postgres。
 */
function fakeDb(initial: Row[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  /** 价格表替身：主键是（类型, 服务商地址, 模型名），与 Postgres 里的 model_prices 一致。 */
  const prices: Record<string, unknown>[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    const at = (n: number) => params[n - 1] as any;
    if (text.includes('INSERT INTO model_configs')) {
      const row = {
        id: at(1),
        kind: at(2),
        name: at(3),
        base_url: at(4),
        model: at(5),
        api_key_cipher: at(6),
        api_key_hint: at(7),
        stream_include_usage: at(8),
        is_default: at(9),
        created_at: new Date(2000),
        updated_at: new Date(2000),
      } as Row;
      rows.push(row);
      return { rows: [row] };
    }
    if (text.includes('DELETE FROM model_configs')) {
      const index = rows.findIndex((row) => row.id === at(1));
      if (index >= 0) rows.splice(index, 1);
      return { rows: [] };
    }
    if (
      text.includes(
        'SELECT id FROM model_configs WHERE kind = $1 AND name = $2',
      )
    ) {
      return {
        rows: rows
          .filter(
            (row) =>
              row.kind === at(1) &&
              row.name === at(2) &&
              (at(3) === null || row.id !== at(3)),
          )
          .map((row) => ({ id: row.id })),
      };
    }
    // 解析默认模型：运行时只在缓存未命中时才走这条查询。
    if (text.includes('SELECT id FROM model_configs WHERE kind = $1 ORDER BY'))
      return {
        rows: rows
          .filter((row) => row.kind === at(1))
          .sort(
            (a, b) =>
              Number(b.is_default) - Number(a.is_default) ||
              a.created_at.getTime() - b.created_at.getTime() ||
              a.id.localeCompare(b.id),
          )
          .slice(0, 1)
          .map((row) => ({ id: row.id })),
      };
    // 页面列表查询：带 LEFT JOIN model_prices，价格按（类型 + 服务商 + 模型）匹配。
    if (text.includes('LEFT JOIN model_prices')) {
      const only = text.includes('WHERE c.id = $1') ? at(1) : null;
      const withPrice = rows
        .filter((row) => (only ? row.id === only : true))
        .map((row) => ({
          ...row,
          ...prices.find(
            (item) =>
              item.kind === row.kind &&
              item.provider === row.base_url &&
              item.model === row.model,
          ),
        }));
      return {
        rows: withPrice.sort(
          (a, b) =>
            a.kind.localeCompare(b.kind) ||
            Number(b.is_default) - Number(a.is_default) ||
            a.created_at.getTime() - b.created_at.getTime() ||
            a.id.localeCompare(b.id),
        ),
      };
    }
    if (text.includes('INSERT INTO model_prices')) {
      const price = {
        kind: at(1),
        provider: at(2),
        model: at(3),
        input_price: at(4),
        cached_input_price: at(5),
        output_price: at(6),
        image_price: at(7),
      };
      const index = prices.findIndex(
        (item) =>
          item.kind === price.kind &&
          item.provider === price.provider &&
          item.model === price.model,
      );
      if (index >= 0) prices[index] = price;
      else prices.push(price);
      return { rows: [] };
    }
    // 旧版列表查询（不带价格）保留给未使用价格的用例。
    if (text.includes('SELECT * FROM model_configs ORDER BY kind'))
      return {
        rows: [...rows].sort(
          (a, b) =>
            a.kind.localeCompare(b.kind) ||
            Number(b.is_default) - Number(a.is_default) ||
            a.created_at.getTime() - b.created_at.getTime() ||
            a.id.localeCompare(b.id),
        ),
      };
    if (text.includes('SELECT * FROM model_configs WHERE id = $1'))
      return { rows: rows.filter((row) => row.id === at(1)) };
    if (text.includes('UPDATE model_configs SET kind')) {
      const row = rows.find((item) => item.id === at(1));
      if (!row) return { rows: [] };
      row.kind = at(2);
      row.name = at(3);
      row.base_url = at(4);
      row.model = at(5);
      if (at(6)) row.api_key_cipher = at(6);
      if (at(7)) row.api_key_hint = at(7);
      row.stream_include_usage = at(8);
      row.is_default = at(9);
      return { rows: [row] };
    }
    if (text.includes('SET is_default = true, updated_at = now()')) {
      const row = rows.find((item) => item.id === at(1));
      if (row) row.is_default = true;
      return { rows: row ? [row] : [] };
    }
    if (text.includes('WHERE kind = $1 AND id <> $2')) {
      for (const row of rows)
        if (row.kind === at(1) && row.id !== at(2)) row.is_default = false;
      return { rows: [] };
    }
    if (text.includes('SET is_default = false WHERE kind = $1')) {
      for (const row of rows) if (row.kind === at(1)) row.is_default = false;
      return { rows: [] };
    }
    if (text.includes('SET is_default = true')) {
      if (!rows.some((row) => row.kind === at(1) && row.is_default)) {
        const candidate = rows
          .filter((row) => row.kind === at(1))
          .sort(
            (a, b) =>
              a.created_at.getTime() - b.created_at.getTime() ||
              a.id.localeCompare(b.id),
          )[0];
        if (candidate) candidate.is_default = true;
      }
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${text}`);
  });
  return { query, rows, prices };
}

const config = (secret: string | null, env: Record<string, string> = {}) =>
  ({
    get: (key: string) =>
      key === 'MODEL_CONFIG_SECRET' ? (secret ?? undefined) : env[key],
  }) as unknown as ConfigService;

const service = (
  db: { query: any },
  secret: string | null = SECRET,
  env: Record<string, string> = {},
) =>
  new ModelConfigService(
    db as unknown as DatabaseService,
    config(secret, env),
    new ModelUsageService(db as unknown as DatabaseService),
  );

/** 统计按 id 读取配置详情的次数，也就是缓存未命中的次数；不传 id 时统计全部。 */
const detailReads = (db: { query: any }, nth?: number) =>
  db.query.mock.calls.filter(
    ([sql, params]: [string, string[]]) =>
      String(sql).includes('SELECT * FROM model_configs WHERE id = $1') &&
      (nth === undefined || params[0] === id(nth)),
  ).length;

const createBody = (overrides: Record<string, unknown> = {}) => ({
  kind: 'text',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/',
  model: 'deepseek-chat',
  apiKey: 'sk-1234567890',
  ...overrides,
});

describe('model config management', () => {
  it('creates a config with an encrypted key and makes the first one default', async () => {
    const db = fakeDb();
    const view = await service(db).save(createBody());
    expect(view).toMatchObject({
      kind: 'text',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      provider: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKeyHint: '****7890',
      isDefault: true,
    });
    expect(db.rows[0].api_key_cipher).not.toContain('sk-1234567890');
    expect(view).not.toHaveProperty('apiKey');
  });

  it('keeps the stored key when an update omits it', async () => {
    const db = fakeDb();
    const svc = service(db);
    const created = await svc.save(createBody());
    const cipher = db.rows[0].api_key_cipher;
    const updated = await svc.save(
      createBody({ name: 'DeepSeek 2', apiKey: '' }),
      created.id,
    );
    expect(updated.name).toBe('DeepSeek 2');
    expect(db.rows[0].api_key_cipher).toBe(cipher);
  });

  it('replaces the key only when a new one is provided', async () => {
    const db = fakeDb();
    const svc = service(db);
    const created = await svc.save(createBody());
    const before = db.rows[0].api_key_cipher;
    await svc.save(createBody({ apiKey: 'sk-abcdefgh' }), created.id);
    expect(db.rows[0].api_key_cipher).not.toBe(before);
    expect(db.rows[0].api_key_hint).toBe('****efgh');
  });

  it('rejects a duplicate name within the same kind', async () => {
    const db = fakeDb();
    const svc = service(db);
    await svc.save(createBody());
    await expect(svc.save(createBody())).rejects.toThrow(
      '文本模型下已存在同名配置',
    );
  });

  it('validates type, address, name and key', async () => {
    const svc = service(fakeDb());
    await expect(svc.save(undefined)).rejects.toThrow('模型配置无效');
    await expect(svc.save(createBody({ kind: 'audio' }))).rejects.toThrow(
      '请选择模型类型',
    );
    await expect(
      svc.save(createBody({ baseUrl: 'ftp://provider.test/v1' })),
    ).rejects.toThrow('服务商地址必须是无凭证和查询参数的 HTTP 地址');
    await expect(
      svc.save(createBody({ baseUrl: 'https://user:pw@provider.test/v1' })),
    ).rejects.toThrow('服务商地址必须是无凭证和查询参数的 HTTP 地址');
    await expect(
      svc.save(createBody({ name: 'a'.repeat(41) })),
    ).rejects.toThrow('配置名称需为 1–40 个字符');
    await expect(svc.save(createBody({ apiKey: undefined }))).rejects.toThrow(
      '请填写 API Key',
    );
    await expect(svc.save(createBody({ apiKey: 'sk 1234' }))).rejects.toThrow(
      'API Key 不能包含空格',
    );
  });

  it('requires MODEL_CONFIG_SECRET to store or read keys', async () => {
    const db = fakeDb([seed()]);
    await expect(service(db, null).save(createBody())).rejects.toThrow(
      'MODEL_CONFIG_SECRET',
    );
    await expect(service(db, null).resolve('text')).rejects.toThrow(
      'MODEL_CONFIG_SECRET',
    );
    // 列表和可用性判断不需要解密，密钥缺失时页面仍能打开。
    await expect(service(db, null).list()).resolves.toHaveLength(1);
    await expect(service(db, null).summary('text')).resolves.toMatchObject({
      configured: true,
      model: 'deepseek-chat',
    });
  });

  it('moves the default config and restores one after a deletion', async () => {
    const db = fakeDb([
      seed(),
      seed({
        id: id(2),
        name: '备用模型',
        is_default: false,
        created_at: new Date(2000),
      }),
    ]);
    const svc = service(db);
    await svc.setDefault(id(2));
    expect(db.rows.map((row) => row.is_default)).toEqual([false, true]);
    await svc.remove(id(2));
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].is_default).toBe(true);
  });

  it('removes the default when deleting a config that does not exist', async () => {
    const svc = service(fakeDb());
    await expect(svc.remove(id(99))).rejects.toThrow(
      '模型配置不存在或已被删除',
    );
    await expect(svc.setDefault('not-a-uuid')).rejects.toThrow(
      '模型配置不存在',
    );
  });
});

describe('model config resolution', () => {
  it('decrypts the default config for upstream calls', async () => {
    const svc = service(fakeDb([seed()]));
    await expect(svc.resolve('text')).resolves.toEqual({
      id: id(1),
      kind: 'text',
      name: '默认文本模型',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: PLAIN_KEY,
      streamIncludeUsage: true,
    });
  });

  it('prefers the requested id and reports an unknown id instead of switching models', async () => {
    const db = fakeDb([
      seed(),
      seed({ id: id(2), name: '备用模型', is_default: false }),
    ]);
    const svc = service(db);
    await expect(svc.resolve('text', id(2))).resolves.toMatchObject({
      id: id(2),
      name: '备用模型',
    });
    await expect(svc.resolve('text', id(9))).rejects.toThrow(
      '选择的模型配置不存在或已被删除',
    );
    await expect(svc.resolve('text', 'not-a-uuid')).rejects.toThrow(
      '选择的模型配置不存在或已被删除',
    );
    // 类型不匹配的 id 同样视为选择失效，不会拿去发起图片请求。
    await expect(svc.resolve('image', id(1))).rejects.toThrow(
      '选择的模型配置不存在或已被删除',
    );
  });

  it('falls back to the default when a submitted id is gone', async () => {
    const svc = service(fakeDb([seed()]));
    await expect(svc.summary('text', id(9))).resolves.toEqual({
      configured: true,
      id: id(1),
      name: '默认文本模型',
      model: 'deepseek-chat',
    });
  });

  it('explains how to configure a missing model', async () => {
    const svc = service(fakeDb());
    await expect(svc.resolve('image')).rejects.toThrow(
      '尚未配置生图模型，请先在“模型配置”页面添加',
    );
    await expect(svc.summary('image')).resolves.toEqual({
      configured: false,
      id: null,
      name: null,
      model: null,
    });
  });

  it('reports a key that cannot be decrypted with the current secret', async () => {
    const db = fakeDb([
      seed({
        api_key_cipher: encryptSecret(
          'sk-other',
          deriveKey('another-secret-value-0123456789'),
        ),
      }),
    ]);
    await expect(service(db).resolve('text')).rejects.toThrow(
      '模型 API Key 无法解密',
    );
  });

  it('caches each model detail and only queries the models actually used', async () => {
    const db = fakeDb([
      seed(),
      seed({ id: id(2), name: '备用模型', is_default: false }),
    ]);
    const svc = service(db);
    await svc.resolve('text', id(2));
    await svc.resolve('text', id(2));
    // 同一个模型连续调用只查一次详情，没被用到的模型一次都不查。
    expect(detailReads(db, 2)).toBe(1);
    expect(detailReads(db, 1)).toBe(0);
    await svc.resolve('text', id(1));
    expect(detailReads(db, 1)).toBe(1);
  });

  it('asks for the default model id once per kind', async () => {
    const db = fakeDb([seed()]);
    const svc = service(db);
    const defaultReads = () =>
      db.query.mock.calls.filter(([sql]) =>
        String(sql).includes(
          'SELECT id FROM model_configs WHERE kind = $1 ORDER BY',
        ),
      ).length;
    await svc.resolve('text');
    await svc.resolve('text');
    await svc.summary('text');
    expect(defaultReads()).toBe(1);
  });

  it('refreshes the cached detail after the config is edited', async () => {
    const db = fakeDb([seed()]);
    const svc = service(db);
    await svc.resolve('text', id(1));
    await svc.save(createBody({ name: '改名后的模型' }), id(1));
    await expect(svc.resolve('text', id(1))).resolves.toMatchObject({
      name: '改名后的模型',
    });
  });

  it('always reads the database for the detail used by the page', async () => {
    const db = fakeDb([seed()]);
    const svc = service(db);
    await svc.resolve('text', id(1));
    const detail = await svc.detail(id(1));
    // 详情接口每次查库（带价格），但不会替运行时缓存做填充。
    expect(detailReads(db, 1)).toBe(1);
    expect(
      db.query.mock.calls.filter(([sql]) =>
        String(sql).includes('LEFT JOIN model_prices'),
      ).length,
    ).toBe(1);
    expect(detail.price).toEqual({
      inputPrice: null,
      cachedInputPrice: null,
      outputPrice: null,
      imagePrice: null,
    });
  });

  it('saves the price together with the config', async () => {
    const db = fakeDb();
    const svc = service(db);
    const config = await svc.save(
      createBody({
        price: {
          inputPrice: '1.5',
          cachedInputPrice: '0.2',
          outputPrice: '3',
        },
      }),
    );
    expect(config.price).toEqual({
      inputPrice: '1.5',
      cachedInputPrice: '0.2',
      outputPrice: '3',
      imagePrice: null,
    });
    expect(db.prices).toHaveLength(1);
    expect(db.prices[0]).toMatchObject({
      kind: 'text',
      provider: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      input_price: '1.5',
    });
    await expect(svc.list()).resolves.toMatchObject([
      { name: 'DeepSeek', price: { inputPrice: '1.5' } },
    ]);
  });

  it('leaves the price alone when an edit does not send one', async () => {
    const db = fakeDb([seed()]);
    const svc = service(db);
    await svc.save(
      createBody({
        price: { inputPrice: '2', cachedInputPrice: '0.5', outputPrice: '4' },
      }),
      id(1),
    );
    await svc.save(createBody({ name: '改个名字' }), id(1));
    expect(db.prices).toHaveLength(1);
    expect(db.prices[0]).toMatchObject({ input_price: '2', output_price: '4' });
  });

  it('rejects an invalid price before writing anything', async () => {
    const db = fakeDb();
    const svc = service(db);
    await expect(
      svc.save(createBody({ price: { inputPrice: '-1' } })),
    ).rejects.toThrow('价格必须是非负数，最多保留 8 位小数');
    expect(db.rows).toHaveLength(0);
    expect(db.prices).toHaveLength(0);
  });

  it('picks up a default model change made on the same instance immediately', async () => {
    const db = fakeDb([
      seed(),
      seed({ id: id(2), name: '备用模型', is_default: false }),
    ]);
    const svc = service(db);
    await svc.resolve('text');
    await svc.setDefault(id(2));
    await expect(svc.resolve('text')).resolves.toMatchObject({ id: id(2) });
  });

  it('keeps the detail cache when only the default model changes', async () => {
    const db = fakeDb([
      seed(),
      seed({ id: id(2), name: '备用模型', is_default: false }),
    ]);
    const svc = service(db);
    await svc.resolve('text', id(1));
    await svc.setDefault(id(2));
    await svc.resolve('text', id(1));
    // 切换默认只作废“谁是默认”的判断，其他模型的详情缓存不受影响。
    expect(detailReads(db, 1)).toBe(1);
  });

  it('expires cached details after the default ttl', async () => {
    vi.useFakeTimers();
    try {
      const db = fakeDb([seed()]);
      const svc = service(db);
      await svc.resolve('text', id(1));
      await svc.resolve('text', id(1));
      expect(detailReads(db, 1)).toBe(1);
      // 默认有效期 5 分钟，过了就重新查一次。
      vi.advanceTimersByTime(6 * 60_000);
      await svc.resolve('text', id(1));
      expect(detailReads(db, 1)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps cached details when the ttl is configured to zero', async () => {
    vi.useFakeTimers();
    try {
      const db = fakeDb([seed()]);
      const svc = service(db, SECRET, { MODEL_CONFIG_CACHE_TTL_MS: '0' });
      await svc.resolve('text', id(1));
      vi.advanceTimersByTime(60 * 60_000);
      await svc.resolve('text', id(1));
      // 0 表示永不过期，只靠写操作清理。
      expect(detailReads(db, 1)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
