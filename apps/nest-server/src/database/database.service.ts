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
        '历史记录数据库暂不可用，请检查 Postgres 和 DATABASE_URL',
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
