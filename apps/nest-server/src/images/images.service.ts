import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStorageService } from '../object-storage/object-storage.service.js';
import { ImageApiService, imageFormat } from './image-api.service.js';

interface GenerationRow {
  id: string;
  prompt: string;
  reference_key: string | null;
  result_key: string | null;
  model_name: string;
  status: 'queued' | 'generating' | 'succeeded' | 'failed';
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REFERENCE_KEY =
  /^upload-tests\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}(\.[a-zA-Z0-9.]{1,16})?$/;

@Injectable()
export class ImagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImagesService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private closing = false;
  private active?: Promise<void>;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly api: ImageApiService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running && !this.closing) this.active = this.processNext();
    }, 1500);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.closing = true;
    clearInterval(this.timer);
    await this.active;
  }

  async create(input: unknown) {
    if (!input || typeof input !== 'object')
      throw new BadRequestException('请填写图片描述');
    const { prompt, referenceKey } = input as {
      prompt?: unknown;
      referenceKey?: unknown;
    };
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.trim().length > 4000
    )
      throw new BadRequestException('图片描述需为 1–4000 个字符');
    if (
      referenceKey !== undefined &&
      (typeof referenceKey !== 'string' || !REFERENCE_KEY.test(referenceKey))
    )
      throw new BadRequestException('参考图路径无效，请重新上传');
    const model = this.api.getConfiguration();
    if (!model.configured)
      throw new ServiceUnavailableException(
        '生图服务尚未配置，请检查服务端模型配置',
      );
    if (!this.storage.getStatus().configured)
      throw new ServiceUnavailableException(
        '图片存储尚未配置，请检查服务端配置',
      );
    if (!(await this.db.isReady()))
      throw new ServiceUnavailableException(
        '历史记录服务暂不可用，请检查 Postgres',
      );
    if (referenceKey) {
      try {
        imageFormat(
          (await this.storage.readImage(referenceKey as string)).bytes,
        );
      } catch {
        throw new BadRequestException(
          '无法读取参考图，请上传不超过 10 MB 的 PNG、JPEG 或 WebP 图片',
        );
      }
    }
    const result = await this.db.query<GenerationRow>(
      `INSERT INTO image_generations (id, prompt, reference_key, model_name) VALUES ($1, $2, $3, $4) RETURNING *`,
      [randomUUID(), prompt.trim(), referenceKey || null, model.model],
    );
    return this.serialize(result.rows[0]);
  }

  async list(before?: string) {
    if (before && !UUID.test(before))
      throw new BadRequestException('分页参数无效');
    const result = await this.db.query<GenerationRow>(
      `SELECT * FROM image_generations
       WHERE ($1::uuid IS NULL OR (created_at, id) < (SELECT created_at, id FROM image_generations WHERE id = $1))
       ORDER BY created_at DESC, id DESC LIMIT 13`,
      [before || null],
    );
    const rows = result.rows.slice(0, 12);
    return {
      items: await Promise.all(rows.map((row) => this.serialize(row))),
      nextCursor: result.rows.length > 12 ? rows.at(-1)!.id : null,
    };
  }

  async processNext() {
    if (this.running || this.closing || !this.api.getConfiguration().configured)
      return;
    this.running = true;
    let job: GenerationRow | undefined;
    try {
      // Do not silently reissue a paid generation after an interrupted server process.
      await this.db
        .query(`UPDATE image_generations SET status = 'failed', error_message = '任务中断，请重新生成', completed_at = now()
        WHERE status = 'generating' AND started_at < now() - interval '10 minutes'`);
      const claim = await this.db.query<GenerationRow>(`WITH candidate AS (
        SELECT id FROM image_generations WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE image_generations SET status = 'generating', started_at = now()
        WHERE id IN (SELECT id FROM candidate) RETURNING *`);
      job = claim.rows[0];
      if (!job) return;
      const reference = job.reference_key
        ? await this.storage.readImage(job.reference_key)
        : undefined;
      const image = await this.api.generate(
        job.prompt,
        job.model_name,
        reference,
      );
      const key = `generated-images/${job.id}.${image.extension}`;
      await this.storage.saveImage(key, image.bytes, image.type);
      await this.db.query(
        `UPDATE image_generations SET status = 'succeeded', result_key = $2, completed_at = now() WHERE id = $1`,
        [job.id, key],
      );
    } catch (error) {
      if (job) {
        const message =
          error instanceof HttpException
            ? error.message
            : '生图或图片保存失败，请稍后重试';
        try {
          await this.db.query(
            `UPDATE image_generations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1`,
            [job.id, message],
          );
        } catch {
          this.logger.error('无法保存生图任务状态，请检查 Postgres');
        }
      } else {
        this.logger.warn('暂时无法读取生图队列，请检查 Postgres');
      }
    } finally {
      this.running = false;
    }
  }

  private async serialize(row: GenerationRow) {
    return {
      id: row.id,
      prompt: row.prompt,
      referenceKey: row.reference_key,
      resultKey: row.result_key,
      model: row.model_name,
      status: row.status,
      error: row.error_message,
      createdAt: row.created_at.toISOString(),
      imageUrl: row.result_key
        ? await this.storage.createPreviewUrl(row.result_key)
        : null,
      referenceUrl: row.reference_key
        ? await this.storage.createPreviewUrl(row.reference_key)
        : null,
    };
  }
}
