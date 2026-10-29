export type ModelKind = "text" | "image";

/** 单价：文本为元/百万 tokens，图片为元/张；null 表示未配置，成本不做估算。 */
export interface ModelPrice {
  inputPrice: string | null;
  cachedInputPrice: string | null;
  outputPrice: string | null;
  imagePrice: string | null;
}

export interface ModelConfig {
  id: string;
  kind: ModelKind;
  name: string;
  baseUrl: string;
  provider: string;
  model: string;
  /** 打码后的 API Key，服务端不会返回完整密钥。 */
  apiKeyHint: string;
  streamIncludeUsage: boolean;
  isDefault: boolean;
  price: ModelPrice;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigPayload {
  kind: ModelKind;
  name: string;
  baseUrl: string;
  model: string;
  /** 更新时留空表示沿用已保存的密钥。 */
  apiKey?: string;
  streamIncludeUsage: boolean;
  isDefault: boolean;
  /** 不传表示不改动已保存的价格。 */
  price?: ModelPrice;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/model-configs${path}`, init);
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { message?: unknown }).message;
    throw new Error(
      Array.isArray(message)
        ? message.join("；")
        : typeof message === "string"
          ? message
          : "请求失败，请检查服务状态",
    );
  }
  return body as T;
}

const json = (payload: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export const modelConfigs = {
  list: () => request<ModelConfig[]>("/"),
  detail: (id: string) => request<ModelConfig>(`/${id}`),
  create: (payload: ModelConfigPayload) =>
    request<ModelConfig>("/", { method: "POST", ...json(payload) }),
  update: (id: string, payload: ModelConfigPayload) =>
    request<ModelConfig>(`/${id}`, { method: "PATCH", ...json(payload) }),
  setDefault: (id: string) =>
    request<{ ok: boolean }>(`/${id}/default`, { method: "POST" }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/${id}`, { method: "DELETE" }),
};
