import http from "@/utils/http";

export interface Generation {
  id: string;
  prompt: string;
  referenceKey: string | null;
  referenceUrl: string | null;
  imageUrl: string | null;
  model: string;
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
  create(prompt: string, referenceKey?: string): Promise<Generation | null> {
    return http.post("/api/images", {
      prompt,
      ...(referenceKey ? { referenceKey } : {}),
    });
  },
};

export default imageApi;
