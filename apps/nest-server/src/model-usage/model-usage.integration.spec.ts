import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { ModelUsageService } from './model-usage.service.js';

const connection = process.env.MODEL_USAGE_TEST_DATABASE_URL;
describe.skipIf(!connection)('model usage with PostgreSQL', () => {
  let db: DatabaseService;
  let usage: ModelUsageService;
  beforeAll(async () => {
    db = new DatabaseService(new ConfigService({ DATABASE_URL: connection }));
    await db.onModuleInit();
    usage = new ModelUsageService(db);
  });
  afterAll(async () => {
    await db.onModuleDestroy();
  });
  it('uses the price at call start, isolates providers and preserves unknown values', async () => {
    await usage.savePrice({
      kind: 'text',
      provider: 'https://provider.test/v1/',
      model: 'test',
      input_price: '2',
      cached_input_price: '0.5',
      output_price: '4',
    });
    const first = await usage.begin('text', 'https://provider.test/v1', 'test');
    const other = await usage.begin('text', 'https://other.test/v1', 'test');
    await usage.savePrice({
      kind: 'text',
      provider: 'https://provider.test/v1',
      model: 'test',
      input_price: '10',
      cached_input_price: '1',
      output_price: '10',
    });
    await usage.finish(first, 'succeeded', {
      input: 1000,
      output: 200,
      total: 1200,
      cached: 400,
      reasoning: 50,
    });
    await usage.finish(other, 'unknown');
    const rows = await db.query(
      'SELECT * FROM model_calls WHERE id=ANY($1::uuid[]) ORDER BY provider',
      [[first, other]],
    );
    const call = rows.rows.find((row) => row.id === first)!;
    const unknown = rows.rows.find((row) => row.id === other)!;
    expect(call.estimated_cost).toBe('0.002200000000');
    expect(call.reasoning_tokens).toBe('50');
    expect(unknown.total_tokens).toBeNull();
    expect(unknown.estimated_cost).toBeNull();
    const summary = await usage.summary({ model: 'test' });
    expect(summary.calls).toBe(2);
    expect(summary.usage_unknown).toBe(1);
    expect(summary.cost_unknown).toBe(1);
    const filtered = await usage.calls({
      provider: 'https://provider.test/v1',
      page: '1',
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].id).toBe(first);
  });
  it('retains an unconfirmed record if recording the result fails', async () => {
    const id = await usage.begin('text', 'https://failure.test/v1', 'offline');
    const original = db.query.bind(db);
    const spy = vi
      .spyOn(db, 'query')
      .mockImplementation(async (sql, params) => {
        if (sql.startsWith('UPDATE model_calls'))
          throw new Error('database offline');
        return original(sql, params);
      });
    await usage.finish(id, 'succeeded', {
      input: 10,
      output: 5,
      total: 15,
      cached: 0,
    });
    spy.mockRestore();
    const { items } = await usage.calls({ model: 'offline' });
    expect(items[0].status).toBe('pending');
    expect(items[0].total_tokens).toBeNull();
    expect(items[0].estimated_cost).toBeNull();
  });
  it('records image pricing and leaves pending requests visibly unconfirmed', async () => {
    await usage.savePrice({
      kind: 'image',
      provider: 'https://images.test/v1',
      model: 'image',
      image_price: '0.15',
    });
    const id = await usage.begin('image', 'https://images.test/v1', 'image');
    const pending = await usage.summary({ model: 'image' });
    expect(pending.unconfirmed).toBe(1);
    await usage.finish(id, 'succeeded', { images: 2 });
    const { items } = await usage.calls({ model: 'image' });
    expect(items[0].estimated_cost).toBe('0.300000000000');
    expect(items[0].image_count).toBe('2');
  });
});
