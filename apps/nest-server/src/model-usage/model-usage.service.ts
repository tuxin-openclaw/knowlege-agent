import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { normalizeProviderUrl, providerId } from '../common/provider.js';
import { parsePriceValue } from '../common/price.js';

type Kind = 'text' | 'image';
type FinalStatus = 'succeeded' | 'failed' | 'unknown';
type Usage = {
  input?: number | null;
  output?: number | null;
  total?: number | null;
  cached?: number | null;
  reasoning?: number | null;
  images?: number | null;
};

@Injectable()
export class ModelUsageService {
  private readonly logger = new Logger(ModelUsageService.name);
  constructor(private readonly db: DatabaseService) {}

  /**
   * 在发起上游请求前创建记录，并在同一条 SQL 中读取价格快照。
   * 写入失败必须阻止上游请求，避免出现完全无记录的调用。
   */
  async begin(kind: Kind, base: string, model: string) {
    const id = randomUUID();
    const provider = providerId(base);
    await this.db.query(
      `INSERT INTO model_calls (id, kind, provider, model, input_price, cached_input_price, output_price, image_price)
      SELECT $1, $2, $3, $4, p.input_price, p.cached_input_price, p.output_price, p.image_price
      FROM (SELECT 1) AS singleton LEFT JOIN model_prices p ON p.kind = $2 AND p.provider = $3 AND p.model = $4`,
      [id, kind, provider, model],
    );
    return id;
  }

  /**
   * 使用已保存的价格快照和上游返回的用量计算费用。
   * 缓存明细或任何计价必需字段缺失时保留 NULL，避免把未知值算作零。
   */
  async finish(id: string, status: FinalStatus, usage: Usage = {}) {
    const count = (n: number | null | undefined): number | null =>
      typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
    const input = count(usage.input),
      output = count(usage.output),
      total = count(usage.total);
    let cached = count(usage.cached),
      reasoning = count(usage.reasoning);
    if (input !== null && cached !== null && cached > input) cached = null;
    if (output !== null && reasoning !== null && reasoning > output)
      reasoning = null;
    const images = count(usage.images);
    try {
      await this.db.query(
        `UPDATE model_calls SET status=$2, completed_at=now(), duration_ms=GREATEST(0, (EXTRACT(EPOCH FROM (now()-started_at))*1000)::bigint),
        input_tokens=$3, output_tokens=$4, total_tokens=$5, cached_tokens=$6, reasoning_tokens=$7, image_count=$8,
        estimated_cost=CASE
          WHEN kind='image' AND image_price IS NOT NULL AND $8::bigint IS NOT NULL THEN image_price * $8::numeric
          WHEN kind='text' AND input_price IS NOT NULL AND cached_input_price IS NOT NULL AND output_price IS NOT NULL
            AND $3::bigint IS NOT NULL AND $4::bigint IS NOT NULL AND $6::bigint IS NOT NULL
            THEN ((($3::numeric-$6::numeric)*input_price)+($6::numeric*cached_input_price)+($4::numeric*output_price))/1000000
          ELSE NULL END
        WHERE id=$1 AND status='pending'`,
        [id, status, input, output, total, cached, reasoning, images],
      );
    } catch {
      // 原始 pending 记录保留，避免把未确认的上游结果误报为已完成。
      this.logger.error(`无法写入模型调用结果，记录 ${id} 仍待确认`);
    }
  }

  async savePrice(body: unknown) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('价格配置无效');
    const data = body as Record<string, unknown>;
    if (
      (data.kind !== 'text' && data.kind !== 'image') ||
      typeof data.provider !== 'string' ||
      typeof data.model !== 'string' ||
      !data.model.trim() ||
      data.model.length > 200
    )
      throw new BadRequestException(
        '请填写有效的调用类型、服务商地址和模型名称',
      );
    const provider = normalizeProviderUrl(data.provider);
    const vals =
      data.kind === 'text'
        ? [
            parsePriceValue(data.input_price),
            parsePriceValue(data.cached_input_price),
            parsePriceValue(data.output_price),
            null,
          ]
        : [null, null, null, parsePriceValue(data.image_price)];
    await this.db.query(
      `INSERT INTO model_prices(kind,provider,model,input_price,cached_input_price,output_price,image_price) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (kind,provider,model) DO UPDATE SET input_price=EXCLUDED.input_price,cached_input_price=EXCLUDED.cached_input_price,output_price=EXCLUDED.output_price,image_price=EXCLUDED.image_price,updated_at=now()`,
      [data.kind, provider, data.model.trim(), ...vals],
    );
    return { ok: true };
  }

  private filters(query: Record<string, unknown>) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replace('?', `$${values.length}`));
    };
    for (const key of ['from', 'to'] as const) {
      const v = query[key];
      if (v !== undefined && v !== '') {
        if (
          typeof v !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) ||
          Number.isNaN(Date.parse(v))
        )
          throw new BadRequestException('时间筛选无效');
        add(`started_at ${key === 'from' ? '>=' : '<'} ?::timestamptz`, v);
      }
    }
    for (const key of ['kind', 'provider', 'model', 'status'] as const) {
      const v = query[key];
      if (v !== undefined && v !== '') {
        if (
          typeof v !== 'string' ||
          v.length > 500 ||
          (key === 'kind' && !['text', 'image'].includes(v)) ||
          (key === 'status' &&
            !['pending', 'succeeded', 'failed', 'unknown'].includes(v))
        )
          throw new BadRequestException('筛选参数无效');
        add(`${key} = ?`, v);
      }
    }
    return {
      where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      values,
    };
  }
  async summary(query: Record<string, unknown>) {
    const { where, values } = this.filters(query);
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed, COUNT(*) FILTER (WHERE status IN ('pending','unknown'))::int AS unconfirmed,
      COALESCE(SUM(input_tokens),0)::text AS input_tokens, COALESCE(SUM(output_tokens),0)::text AS output_tokens,
      COALESCE(SUM(total_tokens),0)::text AS total_tokens, COALESCE(SUM(image_count),0)::text AS image_count,
      COUNT(*) FILTER (WHERE (kind='text' AND (input_tokens IS NULL OR output_tokens IS NULL OR total_tokens IS NULL)) OR (kind='image' AND image_count IS NULL))::int AS usage_unknown,
      COALESCE(SUM(estimated_cost),0)::text AS estimated_cost, COUNT(*) FILTER (WHERE estimated_cost IS NULL)::int AS cost_unknown
      FROM model_calls ${where}`,
      values,
    );
    return result.rows[0];
  }
  /** 汇总与分页明细在同一条查询中读取，确保页面展示的是同一数据库快照。 */
  async dashboard(query: Record<string, unknown>) {
    const { where, values } = this.filters(query);
    const page = query.page === undefined ? 1 : Number(query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new BadRequestException('分页参数无效');
    const result = await this.db.query(
      `WITH filtered AS MATERIALIZED (SELECT * FROM model_calls ${where}), summary AS (
      SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed, COUNT(*) FILTER (WHERE status IN ('pending','unknown'))::int AS unconfirmed,
      COALESCE(SUM(input_tokens),0)::text AS input_tokens, COALESCE(SUM(output_tokens),0)::text AS output_tokens,
      COALESCE(SUM(total_tokens),0)::text AS total_tokens, COALESCE(SUM(image_count),0)::text AS image_count,
      COUNT(*) FILTER (WHERE (kind='text' AND (input_tokens IS NULL OR output_tokens IS NULL OR total_tokens IS NULL)) OR (kind='image' AND image_count IS NULL))::int AS usage_unknown,
      COALESCE(SUM(estimated_cost),0)::text AS estimated_cost, COUNT(*) FILTER (WHERE estimated_cost IS NULL)::int AS cost_unknown FROM filtered
    ) SELECT row_to_json(summary) AS overview, detail.* FROM summary LEFT JOIN LATERAL (
      SELECT *, CASE WHEN estimated_cost IS NOT NULL THEN 'known' WHEN (kind='text' AND (input_price IS NULL OR cached_input_price IS NULL OR output_price IS NULL)) OR (kind='image' AND image_price IS NULL) THEN 'unconfigured' ELSE 'unknown' END AS cost_status
      FROM filtered ORDER BY started_at DESC, id DESC LIMIT 20 OFFSET $${values.length + 1}
    ) detail ON true`,
      [...values, (page - 1) * 20],
    );
    const summary = result.rows[0].overview;
    const items = result.rows
      .filter((row) => row.id !== null)
      .map(({ overview: _overview, ...row }) => row);
    return { summary, items, total: summary.calls, page, pageSize: 20 };
  }
  async calls(query: Record<string, unknown>) {
    const { where, values } = this.filters(query);
    const page = query.page === undefined ? 1 : Number(query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new BadRequestException('分页参数无效');
    const count = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM model_calls ${where}`,
      values,
    );
    const rows = await this.db.query(
      `SELECT *, CASE WHEN estimated_cost IS NOT NULL THEN 'known' WHEN (kind='text' AND (input_price IS NULL OR cached_input_price IS NULL OR output_price IS NULL)) OR (kind='image' AND image_price IS NULL) THEN 'unconfigured' ELSE 'unknown' END AS cost_status FROM model_calls ${where} ORDER BY started_at DESC,id DESC LIMIT 20 OFFSET $${values.length + 1}`,
      [...values, (page - 1) * 20],
    );
    return { items: rows.rows, total: count.rows[0].total, page, pageSize: 20 };
  }
}
