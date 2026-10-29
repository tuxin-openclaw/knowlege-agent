import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { normalizeProviderUrl, providerId } from '../common/provider.js';
import { ModelUsageService } from '../model-usage/model-usage.service.js';
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
} from './model-config.crypto.js';

export type ModelKind = 'text' | 'image';

/** 数据库中的模型配置行；api_key_cipher 只在服务端解密使用，不对外返回。 */
interface ModelConfigRow {
  id: string;
  kind: ModelKind;
  name: string;
  base_url: string;
  model: string;
  api_key_cipher: string;
  api_key_hint: string;
  stream_include_usage: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
  /** 以下四列来自 model_prices 的 LEFT JOIN，只有列表和详情查询会带出来。 */
  input_price?: string | null;
  cached_input_price?: string | null;
  output_price?: string | null;
  image_price?: string | null;
}

/** 模型价格，单位为元/百万 tokens（图片为元/张）；null 表示未配置，不估算成本。 */
export type ModelPriceView = {
  inputPrice: string | null;
  cachedInputPrice: string | null;
  outputPrice: string | null;
  imagePrice: string | null;
};

/** 页面展示用的模型配置，API Key 只返回打码提示。 */
export type ModelConfigView = {
  id: string;
  kind: ModelKind;
  name: string;
  baseUrl: string;
  provider: string;
  model: string;
  apiKeyHint: string;
  streamIncludeUsage: boolean;
  isDefault: boolean;
  /** 与该配置的服务商地址、模型名对应的价格；调用记录按同一组键取价。 */
  price: ModelPriceView;
  createdAt: string;
  updatedAt: string;
};

/** 发起上游请求所需的模型配置，包含解密后的 API Key，只能留在服务端。 */
export type ResolvedModelConfig = {
  id: string;
  kind: ModelKind;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  streamIncludeUsage: boolean;
};

/** 只含元数据的当前模型，用来判断能否入队并展示默认模型。 */
export type ModelConfigSummary = {
  configured: boolean;
  id: string | null;
  name: string | null;
  model: string | null;
};

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** 模型密钥至少 16 个字符，避免使用几乎等于明文的短密钥派生 AES 密钥。 */
const MIN_SECRET_LENGTH = 16;
/**
 * 缓存默认有效期：5 分钟。
 * 通过接口改配置会立即删掉对应缓存，所以这个上限只兜“绕过接口改库”和“别的实例改库”两种情况；
 * 设得太短（比如 30 秒）会让偶发调用几乎每次都未命中，反而起不到缓存作用。
 */
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;

/** 缓存的配置详情，expiresAt 之后重新按 id 查一次。 */
type CachedRow = { row: ModelConfigRow; expiresAt: number };

const isKind = (value: unknown): value is ModelKind =>
  value === 'text' || value === 'image';

@Injectable()
export class ModelConfigService {
  /** 按模型 id 缓存的配置详情：同一个模型反复调用只查一次库。 */
  private readonly rows = new Map<string, CachedRow>();
  /**
   * 每种类型的默认模型 id。
   * 调用方没指定模型时才需要它，单独缓存可以避免每次都问“谁是默认”。
   */
  private readonly defaults = new Map<
    ModelKind,
    { id: string | null; expiresAt: number }
  >();
  /** 派生密钥缓存，避免每次加解密都重新计算 SHA-256。 */
  private derived?: { secret: string; key: Buffer };

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly usage: ModelUsageService,
  ) {}

  /**
   * 查询模型配置用的 SQL：把同服务商、同模型的单价格出来。
   * 价格表的主键与调用记录取价的键一致（类型 + 服务商地址 + 模型名），
   * 所以“一条配置一份价格”，两条配置指向同一个模型时共享同一行价格。
   */
  private static readonly SELECT_CONFIG = `SELECT c.id, c.kind, c.name, c.base_url, c.model,
      c.api_key_cipher, c.api_key_hint, c.stream_include_usage, c.is_default,
      c.created_at, c.updated_at,
      p.input_price, p.cached_input_price, p.output_price, p.image_price
    FROM model_configs c
    LEFT JOIN model_prices p
      ON p.kind = c.kind AND p.provider = c.base_url AND p.model = c.model`;

  /** 读取全部模型配置（含价格），按类型和创建顺序排列，默认模型排在同类最前。 */
  async list(): Promise<ModelConfigView[]> {
    const result = await this.db.query<ModelConfigRow>(
      `${ModelConfigService.SELECT_CONFIG}
      ORDER BY c.kind, c.is_default DESC, c.created_at, c.id`,
    );
    return result.rows.map((row) => this.view(row));
  }

  /** 读取单条配置详情（含价格、不含 API Key），页面编辑和排错时使用；始终读数据库。 */
  async detail(id: string): Promise<ModelConfigView> {
    if (!UUID.test(id)) throw new NotFoundException('模型配置不存在');
    const result = await this.db.query<ModelConfigRow>(
      `${ModelConfigService.SELECT_CONFIG} WHERE c.id = $1`,
      [id],
    );
    if (!result.rows.length)
      throw new NotFoundException('模型配置不存在或已被删除');
    return this.view(result.rows[0]);
  }

  /**
   * 新建或更新一条模型配置。
   * 更新时未填写 API Key 表示沿用原密钥；同一类型下名称不能重复。
   * 保存后会保证该类型存在且只保留一个默认模型。
   */
  async save(body: unknown, id?: string): Promise<ModelConfigView> {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('模型配置无效');
    const data = body as Record<string, unknown>;
    if (!isKind(data.kind))
      throw new BadRequestException('请选择模型类型（文本或图片）');
    const kind = data.kind;
    const name = this.field(data.name, '配置名称', 40);
    const model = this.field(data.model, '模型名称', 200);
    const baseUrl = normalizeProviderUrl(data.baseUrl);
    const streamIncludeUsage = data.streamIncludeUsage ?? true;
    const isDefault = data.isDefault ?? false;
    if (typeof streamIncludeUsage !== 'boolean')
      throw new BadRequestException('“统计用量”设置无效');
    if (typeof isDefault !== 'boolean')
      throw new BadRequestException('“设为默认”设置无效');

    const existing = id ? await this.requireRow(id) : undefined;
    let cipher: string | undefined;
    let hint: string | undefined;
    const rawKey = data.apiKey;
    if (rawKey !== undefined && rawKey !== null && rawKey !== '') {
      const apiKey = this.field(rawKey, 'API Key', 1000);
      if (/\s/.test(apiKey))
        throw new BadRequestException('API Key 不能包含空格');
      if (apiKey.length < 4)
        throw new BadRequestException('API Key 至少需要 4 个字符');
      cipher = encryptSecret(apiKey, this.secretKey());
      hint = this.mask(apiKey);
    } else if (!existing) {
      throw new BadRequestException('请填写 API Key');
    }

    const duplicate = await this.db.query(
      'SELECT id FROM model_configs WHERE kind = $1 AND name = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)',
      [kind, name, existing?.id ?? null],
    );
    if (duplicate.rows.length)
      throw new ConflictException(
        `${kind === 'text' ? '文本' : '图片'}模型下已存在同名配置“${name}”，请换个名称`,
      );

    // 价格和配置放在同一个请求里保存：价格表的键就是类型 + 服务商地址 + 模型名，
    // 与调用记录取价用的键一致。请求里带 price 才写入，不带表示不改动已有价格。
    if (data.price !== undefined && data.price !== null) {
      if (typeof data.price !== 'object')
        throw new BadRequestException('价格配置无效');
      const price = data.price as Record<string, unknown>;
      await this.usage.savePrice({
        kind,
        provider: baseUrl,
        model,
        input_price: price.inputPrice,
        cached_input_price: price.cachedInputPrice,
        output_price: price.outputPrice,
        image_price: price.imagePrice,
      });
    }

    const row = existing
      ? (
          await this.db.query<ModelConfigRow>(
            `UPDATE model_configs SET kind = $2, name = $3, base_url = $4, model = $5,
              api_key_cipher = COALESCE($6, api_key_cipher), api_key_hint = COALESCE($7, api_key_hint),
              stream_include_usage = $8, is_default = $9, updated_at = now()
            WHERE id = $1 RETURNING *`,
            [
              existing.id,
              kind,
              name,
              baseUrl,
              model,
              cipher ?? null,
              hint ?? null,
              streamIncludeUsage,
              isDefault,
            ],
          )
        ).rows[0]
      : (
          await this.db.query<ModelConfigRow>(
            `INSERT INTO model_configs (id, kind, name, base_url, model, api_key_cipher, api_key_hint, stream_include_usage, is_default)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
              randomUUID(),
              kind,
              name,
              baseUrl,
              model,
              cipher,
              hint,
              streamIncludeUsage,
              isDefault,
            ],
          )
        ).rows[0];
    if (isDefault) await this.clearOtherDefaults(kind, row.id);
    await this.ensureDefault(kind);
    this.forget(row.id);
    // 重新读一次（带价格），让返回值反映 ensureDefault 调整后的默认状态和刚保存的单价。
    return this.detail(row.id);
  }

  /**
   * 删除模型配置，并在同类还有剩余配置时补选默认模型。
   * 已排队或历史记录里的生图任务通过 model_config_id 引用配置，
   * 配置删除后这些任务会回退到当前默认生图模型。
   */
  async remove(id: string) {
    const row = await this.requireRow(id);
    await this.db.query('DELETE FROM model_configs WHERE id = $1', [row.id]);
    await this.ensureDefault(row.kind);
    this.forget(row.id);
    return { ok: true };
  }

  /** 将指定配置设为它所在类型的默认模型，其余同类配置取消默认。 */
  async setDefault(id: string) {
    const row = await this.requireRow(id);
    await this.db.query(
      'UPDATE model_configs SET is_default = false WHERE kind = $1',
      [row.kind],
    );
    await this.db.query(
      'UPDATE model_configs SET is_default = true, updated_at = now() WHERE id = $1',
      [row.id],
    );
    // 只改了“谁是默认”，各配置的内容没变，所以只作废默认指针，详情缓存继续可用。
    this.defaults.clear();
    return { ok: true };
  }

  /**
   * 读取当前可用的模型元数据（不解密密钥）。
   * 指定 id 已不存在时回退到该类型的默认模型，用于提交生图任务这类自带旧 id 的场景。
   */
  async summary(
    kind: ModelKind,
    requestedId?: unknown,
  ): Promise<ModelConfigSummary> {
    const row = await this.pick(kind, requestedId);
    return {
      configured: !!row,
      id: row?.id ?? null,
      name: row?.name ?? null,
      model: row?.model ?? null,
    };
  }

  /**
   * 取出发起上游请求所需的配置，包含解密后的 API Key。
   * 指定 id 有效但不存在时报错而不是静默换模型，避免对比结果张冠李戴；
   * 未指定 id 时使用该类型的默认模型，没有任何配置时给出页面配置指引。
   */
  async resolve(
    kind: ModelKind,
    requestedId?: unknown,
  ): Promise<ResolvedModelConfig> {
    const row = await this.find(kind, requestedId);
    if (!row) {
      if (typeof requestedId === 'string' && requestedId.trim())
        throw new NotFoundException(
          '选择的模型配置不存在或已被删除，请重新选择',
        );
      throw new ServiceUnavailableException(
        kind === 'text'
          ? '尚未配置文本模型，请先在“模型配置”页面添加'
          : '尚未配置生图模型，请先在“模型配置”页面添加',
      );
    }
    const key = this.secretKey();
    let apiKey: string;
    try {
      apiKey = decryptSecret(row.api_key_cipher, key);
    } catch {
      throw new ServiceUnavailableException(
        '模型 API Key 无法解密，请确认 MODEL_CONFIG_SECRET 与保存时一致',
      );
    }
    return {
      id: row.id,
      kind,
      name: row.name,
      baseUrl: row.base_url,
      model: row.model,
      apiKey,
      streamIncludeUsage: row.stream_include_usage,
    };
  }

  /**
   * 指定 id 时按 id 取详情（不存在返回 undefined），否则取该类型的默认模型。
   * 读的是按 id 的缓存，所以重复调用同一个模型不会访问数据库。
   */
  private async find(kind: ModelKind, requestedId?: unknown) {
    if (typeof requestedId === 'string' && requestedId.trim()) {
      if (!UUID.test(requestedId)) return undefined;
      const row = await this.cachedRow(requestedId);
      return row?.kind === kind ? row : undefined;
    }
    const id = await this.defaultId(kind);
    if (!id) return undefined;
    const row = await this.cachedRow(id);
    if (row) return row;
    // 默认模型指向的记录已被删除：丢掉这个指针，重新问一次数据库。
    this.defaults.delete(kind);
    const next = await this.defaultId(kind);
    return next ? this.cachedRow(next) : undefined;
  }

  /** 与 find 相同，但指定 id 已失效时回退到该类型的默认模型。 */
  private async pick(kind: ModelKind, requestedId?: unknown) {
    const row = await this.find(kind, requestedId);
    if (row || !requestedId) return row;
    return this.find(kind);
  }

  /** 按 id 读一条配置：命中缓存直接返回，未命中才查库并把结果写进缓存。 */
  private async cachedRow(id: string) {
    const hit = this.rows.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.row;
    const result = await this.db.query<ModelConfigRow>(
      'SELECT * FROM model_configs WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      // 已被删除的记录不能留在缓存里，否则会把不存在的模型当成可用模型。
      this.rows.delete(id);
      return undefined;
    }
    this.rows.set(id, { row, expiresAt: this.expiry() });
    return row;
  }

  /** 读取某种类型的默认模型 id；没有任何配置时缓存 null，避免空表时反复查库。 */
  private async defaultId(kind: ModelKind): Promise<string | null> {
    const hit = this.defaults.get(kind);
    if (hit && hit.expiresAt > Date.now()) return hit.id;
    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM model_configs WHERE kind = $1 ORDER BY is_default DESC, created_at, id LIMIT 1',
      [kind],
    );
    const id = result.rows[0]?.id ?? null;
    this.defaults.set(kind, { id, expiresAt: this.expiry() });
    return id;
  }

  /**
   * 计算缓存条目的到期时间。
   * MODEL_CONFIG_CACHE_TTL_MS 未设置时用默认值，设为 0 表示永不过期（只靠写操作清理）。
   */
  private expiry() {
    const ttl = this.ttl();
    return ttl > 0 ? Date.now() + ttl : Number.POSITIVE_INFINITY;
  }

  /** 读取缓存有效期；非法值退回默认值，避免写错环境变量导致缓存永久失效或永不过期。 */
  private ttl() {
    const raw = this.config.get<string>('MODEL_CONFIG_CACHE_TTL_MS')?.trim();
    if (!raw) return DEFAULT_CACHE_TTL_MS;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CACHE_TTL_MS;
  }

  /**
   * 写完一条配置之后清掉它的详情缓存，并作废默认指针。
   * 默认指针一起清是因为新增、改名和删除都可能改变“谁是默认模型”。
   */
  private forget(id: string) {
    this.rows.delete(id);
    this.defaults.clear();
  }

  private async requireRow(id: string) {
    if (!UUID.test(id)) throw new NotFoundException('模型配置不存在');
    const result = await this.db.query<ModelConfigRow>(
      'SELECT * FROM model_configs WHERE id = $1',
      [id],
    );
    if (!result.rows.length)
      throw new NotFoundException('模型配置不存在或已被删除');
    return result.rows[0];
  }

  private async clearOtherDefaults(kind: ModelKind, keepId: string) {
    await this.db.query(
      'UPDATE model_configs SET is_default = false WHERE kind = $1 AND id <> $2 AND is_default',
      [kind, keepId],
    );
  }

  /** 类型下没有默认模型时，补选创建时间最早的一条，保证页面和调用总有一个可用模型。 */
  private async ensureDefault(kind: ModelKind) {
    await this.db.query(
      `UPDATE model_configs SET is_default = true
      WHERE id = (
        SELECT id FROM model_configs
        WHERE kind = $1 AND NOT EXISTS (SELECT 1 FROM model_configs WHERE kind = $1 AND is_default)
        ORDER BY created_at, id LIMIT 1
      )`,
      [kind],
    );
  }

  /**
   * 读取并校验 MODEL_CONFIG_SECRET，用于加密或解密模型 API Key。
   * 派生结果按密钥内容缓存：解密仍然每次调用都做，但不再重复计算 SHA-256。
   */
  private secretKey(): Buffer {
    const secret = this.config.get<string>('MODEL_CONFIG_SECRET')?.trim();
    if (!secret || secret.length < MIN_SECRET_LENGTH)
      throw new ServiceUnavailableException(
        `模型密钥不可用：请在 nest-server/.env 设置至少 ${MIN_SECRET_LENGTH} 个字符的 MODEL_CONFIG_SECRET 后重启服务`,
      );
    if (this.derived?.secret !== secret) {
      this.derived = { secret, key: deriveKey(secret) };
    }
    return this.derived.key;
  }

  private field(value: unknown, label: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      throw new BadRequestException(`${label}需为 1–${max} 个字符`);
    return value.trim();
  }

  /** numeric(24,8) 会补满 8 位小数，返回页面之前去掉多余的 0（1.50000000 → 1.5）。 */
  private trimPrice(value: string | null | undefined) {
    if (value === null || value === undefined) return null;
    return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
  }

  private mask(apiKey: string) {
    return apiKey.length <= 8 ? '****' : `****${apiKey.slice(-4)}`;
  }

  private view(row: ModelConfigRow): ModelConfigView {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      baseUrl: row.base_url,
      provider: providerId(row.base_url),
      model: row.model,
      apiKeyHint: row.api_key_hint,
      streamIncludeUsage: row.stream_include_usage,
      isDefault: row.is_default,
      price: {
        inputPrice: this.trimPrice(row.input_price),
        cachedInputPrice: this.trimPrice(row.cached_input_price),
        outputPrice: this.trimPrice(row.output_price),
        imagePrice: this.trimPrice(row.image_price),
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
