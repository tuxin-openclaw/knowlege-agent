let toastTimer = 0;

function showError(message: string) {
  let toast = document.getElementById("http-error-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "http-error-toast";
    toast.setAttribute("role", "alert");
    Object.assign(toast.style, {
      position: "fixed",
      zIndex: "9999",
      top: "max(20px, env(safe-area-inset-top))",
      left: "50%",
      transform: "translateX(-50%)",
      maxWidth: "min(90vw, 520px)",
      padding: "12px 18px",
      borderRadius: "12px",
      background: "#422b2b",
      color: "#fff",
      boxShadow: "0 8px 28px #0003",
      font: "500 14px/1.5 system-ui, sans-serif",
    });
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.remove(), 4000);
}

async function request<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    showError(error instanceof Error ? error.message : "请求失败，请稍后重试");
    return null;
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    if (response.ok) throw new Error("服务器返回了无法识别的数据");
  }
  if (!response.ok) {
    const message = payload.message;
    throw new Error(
      Array.isArray(message)
        ? message.join("；")
        : typeof message === "string"
          ? message
          : "请求失败，请稍后重试",
    );
  }
  return payload as T;
}

const http = {
  get<T>(path: string): Promise<T | null> {
    return request(() => jsonRequest<T>(path));
  },
  post<T>(path: string, body: unknown): Promise<T | null> {
    return request(() =>
      jsonRequest<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  putFile(
    url: string,
    headers: Record<string, string>,
    file: File,
  ): Promise<Response | null> {
    return request(async () => {
      const response = await fetch(url, { method: "PUT", headers, body: file });
      if (!response.ok) throw new Error("参考图上传失败，请重新选择图片后重试");
      return response;
    });
  },
};

export default http;
