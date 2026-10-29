import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS image_generations (
  id uuid PRIMARY KEY,
  prompt text NOT NULL,
  reference_key text,
  result_key text,
  model_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'succeeded', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS image_generations_history_idx ON image_generations (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS image_generations_queue_idx ON image_generations (created_at) WHERE status = 'queued';

-- 模型配置由页面维护；API Key 以 AES-256-GCM 密文保存，密钥来自 MODEL_CONFIG_SECRET。
CREATE TABLE IF NOT EXISTS model_configs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('text', 'image')),
  name text NOT NULL,
  base_url text NOT NULL,
  model text NOT NULL,
  api_key_cipher text NOT NULL,
  api_key_hint text NOT NULL,
  stream_include_usage boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);
CREATE INDEX IF NOT EXISTS model_configs_kind_idx ON model_configs (kind, is_default DESC, created_at);
-- 生图任务记录使用的模型配置；配置删除后任务回退到当前默认模型。
ALTER TABLE image_generations ADD COLUMN IF NOT EXISTS model_config_id uuid;

CREATE TABLE IF NOT EXISTS model_prices (
  kind text NOT NULL CHECK (kind IN ('text', 'image')),
  provider text NOT NULL,
  model text NOT NULL,
  input_price numeric(24, 8), cached_input_price numeric(24, 8), output_price numeric(24, 8), image_price numeric(24, 8),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, provider, model)
);
CREATE TABLE IF NOT EXISTS model_calls (
  id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('text', 'image')),
  provider text NOT NULL, model text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'unknown')),
  input_tokens bigint, output_tokens bigint, total_tokens bigint, cached_tokens bigint, reasoning_tokens bigint, image_count bigint,
  input_price numeric(24, 8), cached_input_price numeric(24, 8), output_price numeric(24, 8), image_price numeric(24, 8),
  duration_ms bigint,
  estimated_cost numeric(32, 12)
);
CREATE INDEX IF NOT EXISTS model_calls_started_idx ON model_calls (started_at DESC, id DESC);

`;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool?: Pool;
  private ready?: Promise<void>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    if (!this.config.get<string>('DATABASE_URL')) return;
    try {
      await this.ensureReady();
    } catch {
      this.logger.warn('Postgres 暂不可用，请检查 DATABASE_URL 和数据库服务');
    }
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
    try {
      await this.ensureReady();
      return await this.pool!.query<T>(sql, params);
    } catch {
      throw new ServiceUnavailableException(
        '数据库暂不可用，请检查 Postgres 和 DATABASE_URL',
      );
    }
  }

  async isReady() {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async ensureReady() {
    const connectionString = this.config.get<string>('DATABASE_URL')?.trim();
    if (!connectionString) throw new Error('DATABASE_URL is required');
    if (!this.pool) {
      this.pool = new Pool({
        connectionString,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      });
      this.pool.on('error', () => this.logger.error('Postgres 连接异常'));
    }
    if (!this.ready) {
      this.ready = this.pool
        .query(SCHEMA)
        .then(() => undefined)
        .catch((error: unknown) => {
          this.ready = undefined;
          throw error;
        });
    }
    await this.ready;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
