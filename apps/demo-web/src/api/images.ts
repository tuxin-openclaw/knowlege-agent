import http from "@/utils/http";

export interface Generation {
  id: string;
  prompt: string;
  referenceKey: string | null;
  referenceUrl: string | null;
  imageUrl: string | null;
  model: string;
  /** 使用的生图模型配置，配置被删除后仍保留当时的记录。 */
  modelId: string | null;
  status: "queued" | "generating" | "succeeded" | "failed";
  error: string | null;
  createdAt: string;
}

export interface HistoryPage {
  items: Generation[];
  nextCursor: string | null;
}

const imageApi = {
  getHistory(before?: string): Promise<HistoryPage | null> {
    const query = before ? `?before=${encodeURIComponent(before)}` : "";
    return http.get(`/api/images${query}`);
  },
  create(
    prompt: string,
    referenceKey?: string,
    modelId?: string,
  ): Promise<Generation | null> {
    return http.post("/api/images", {
      prompt,
      ...(referenceKey ? { referenceKey } : {}),
      ...(modelId ? { modelId } : {}),
    });
  },
};

export default imageApi;
