import {
  BadRequestException,
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import {
  ObjectStorageService,
  REFERENCE_PREFIX,
  TEMP_UPLOAD_PREFIX,
} from '../object-storage/object-storage.service.js';
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
  /^(?:(?:upload-tests|knowlege-agent\/tmp)\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}(\.[a-zA-Z0-9.]{1,16})?|knowlege-agent\/references\/[a-f0-9-]{36}\.(?:png|jpg|webp))$/;

@Injectable()
export class ImagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImagesService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private closing = false;
  private active?: Promise<void>;

  /**
   * 保存生图流程依赖的服务。
   * 数据库管理任务状态，对象存储管理图片，图像服务负责调用上游模型。
   */
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly api: ImageApiService,
  ) {}

  /**
   * 启动后台队列轮询。
   * 定期检查任务，但同一进程里只处理一个生图任务。
   */
  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running && !this.closing) this.active = this.processNext();
    }, 1500);
    this.timer.unref();
  }

  /**
   * 停止接收新任务并等待当前任务结束。
   * 避免关闭服务时中断图片保存或任务状态更新。
   */
  async onModuleDestroy() {
    this.closing = true;
    clearInterval(this.timer);
    await this.active;
  }

  /**
   * 校验生图请求并将任务写入队列。
   * 临时参考图会先复制到正式目录，再把正式 key 保存到任务记录。
   */
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
    const id = randomUUID();
    let storedReferenceKey = (referenceKey as string | undefined) || null;
    let promotedKey: string | undefined;
    if (storedReferenceKey) {
      let reference: { bytes: Uint8Array; contentType: string };
      let format: ReturnType<typeof imageFormat>;
      try {
        reference = await this.storage.readImage(storedReferenceKey);
        format = imageFormat(reference.bytes);
      } catch {
        throw new BadRequestException(
          '无法读取参考图，请上传不超过 10 MB 的 PNG、JPEG 或 WebP 图片',
        );
      }
      if (storedReferenceKey.startsWith(TEMP_UPLOAD_PREFIX)) {
        // 每个任务使用独立的正式 key，后续复用不依赖临时文件的保留时间。
        promotedKey = `${REFERENCE_PREFIX}${id}.${format.extension}`;
        try {
          await this.storage.saveImage(
            promotedKey,
            reference.bytes,
            format.type,
          );
        } catch {
          throw new BadGatewayException('参考图保存失败，请稍后重试');
        }
        // 正式记录只引用正式目录，临时原件交给 COS 生命周期清理。
        storedReferenceKey = promotedKey;
      }
    }
    let row: GenerationRow;
    try {
      const result = await this.db.query<GenerationRow>(
        `INSERT INTO image_generations (id, prompt, reference_key, model_name) VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, prompt.trim(), storedReferenceKey, model.model],
      );
      row = result.rows[0];
    } catch (error) {
      if (promotedKey) {
        try {
          // 写库响应丢失时先确认记录不存在，避免删掉已提交任务的参考图。
          const saved = await this.db.query(
            'SELECT id FROM image_generations WHERE id = $1',
            [id],
          );
          if (!saved.rows.length) await this.storage.deleteImage(promotedKey);
        } catch {
          this.logger.error('参考图保存状态无法确认，请检查数据库和对象存储');
        }
      }
      throw error;
    }
    return this.serialize(row);
  }

  /**
   * 按创建时间倒序读取作品，并支持用上一页游标继续加载。
   * 返回数据中的图片 key 会转换成短期预览地址。
   */
  async list(before?: string) {
    if (before && !UUID.test(before))
      throw new BadRequestException('分页参数无效');
    const result = await this.db.query<GenerationRow>(
      `SELECT * FROM image_generations
       WHERE ($1::uuid IS NULL OR (created_at, id) < (SELECT created_at, id FROM image_generations WHERE id = $1))
       ORDER BY created_at DESC, id DESC LIMIT 13`,
      [before || null],
    );
    // 多查一条只为判断是否还有下一页，单页最多返回 12 条。
    const rows = result.rows.slice(0, 12);
    return {
      items: await Promise.all(rows.map((row) => this.serialize(row))),
      nextCursor: result.rows.length > 12 ? rows.at(-1)!.id : null,
    };
  }

  /**
   * 领取并处理一条待生成任务。
   * 成功时保存结果并更新 key，失败时将任务标为失败并记录原因。
   */
  async processNext() {
    if (this.running || this.closing || !this.api.getConfiguration().configured)
      return;
    this.running = true;
    let job: GenerationRow | undefined;
    try {
      // 进程中断的付费任务标记为失败，避免服务重启后自动重复扣费。
      await this.db
        .query(`UPDATE image_generations SET status = 'failed', error_message = '任务中断，请重新生成', completed_at = now()
        WHERE status = 'generating' AND started_at < now() - interval '10 minutes'`);
      // 原子领取一条任务，并跳过其他实例已经锁定的任务行。
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
      // 让下一轮轮询可以继续领取任务。
      this.running = false;
    }
  }

  /**
   * 将数据库行整理成前端作品格式。
   * 数据库只保存对象 key，预览地址在读取时重新签发。
   */
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
