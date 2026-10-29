export type Call = {
  id: string;
  kind: "text" | "image";
  provider: string;
  model: string;
  started_at: string;
  status: "pending" | "succeeded" | "failed" | "unknown";
  duration_ms: string | null;
  input_tokens: string | null;
  output_tokens: string | null;
  total_tokens: string | null;
  cached_tokens: string | null;
  reasoning_tokens: string | null;
  image_count: string | null;
  estimated_cost: string | null;
  cost_status: "known" | "unconfigured" | "unknown";
};
export type Summary = {
  calls: number;
  succeeded: number;
  failed: number;
  unconfirmed: number;
  input_tokens: string;
  output_tokens: string;
  total_tokens: string;
  image_count: string;
  usage_unknown: number;
  estimated_cost: string;
  cost_unknown: number;
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/model-usage${path}`, init);
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { message?: string }).message;
    throw new Error(
      typeof message === "string" ? message : "请求失败，请检查服务状态",
    );
  }
  return body as T;
}
export const modelUsage = {
  dashboard: (query: string) =>
    request<{
      summary: Summary;
      items: Call[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/dashboard?${query}`),
  summary: (query: string) => request<Summary>(`/summary?${query}`),
  calls: (query: string) =>
    request<{ items: Call[]; total: number; page: number; pageSize: number }>(
      `/calls?${query}`,
    ),
};
