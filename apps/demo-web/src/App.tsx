import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

interface UploadConfig {
  configured: boolean;
  missing: string[];
  maxUploadBytes: number;
}

interface UploadResult {
  key: string;
  name: string;
  size: number;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  uploadExpiresIn: number;
  url: string;
  expiresIn: number;
}

function formatSize(size: number) {
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function App() {
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadConfig() {
      try {
        const response = await fetch("/api/uploads/config", {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("无法连接上传服务，请确认 Nest 服务已启动");
        setConfig(await response.json());
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "无法连接上传服务");
        }
      }
    }
    void loadConfig();
    return () => controller.abort();
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !config?.configured || uploading) return;
    setError("");
    setResult(null);
    if (file.size === 0 || file.size > config.maxUploadBytes) {
      setConnectionError(
        `请选择非空且不超过 ${formatSize(config.maxUploadBytes)} 的文件`,
      );
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          response.status === 413
            ? "文件超过 10 MB，请选择较小的文件"
            : Array.isArray(payload.message)
              ? payload.message.join("；")
              : payload.message || "上传失败，请稍后再试",
        );
      }
      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: payload.uploadHeaders,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("COS 上传失败，请检查存储桶 CORS 配置后重试");
      }
      setResult(payload);
    } catch (error) {
      setError(error instanceof Error ? error.message : "上传失败，请稍后再试");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="upload-page">
      <header>
        <span className="eyebrow">腾讯云 COS</span>
        <h1>文件上传测试</h1>
        <p>选择一个文件，上传到对象存储，再下载确认内容。</p>
      </header>

      <section className="upload-card" aria-label="上传文件">
        <div className="card-heading">
          <h2>上传文件</h2>
          <span className={`status ${config?.configured ? "ready" : ""}`}>
            {config
              ? config.configured
                ? "服务已配置"
                : "等待配置"
              : connectionError
                ? "服务未连接"
                : "连接服务中"}
          </span>
        </div>

        {config && !config.configured && (
          <p className="notice" role="status">
            请填写 apps/nest-server/.env 中的 {config.missing.join("、")}
            ，重启服务后刷新页面。
          </p>
        )}

        <form onSubmit={upload}>
          <label className="file-picker" htmlFor="upload-file">
            <strong>{file ? file.name : "选择要上传的文件"}</strong>
            <span>{file ? formatSize(file.size) : "单个文件，最大 10 MB"}</span>
            <input
              id="upload-file"
              type="file"
              disabled={uploading}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError("");
              }}
            />
          </label>
          <button
            type="submit"
            disabled={!file || uploading || !config?.configured}
          >
            {uploading ? "正在上传至 COS…" : "上传到 COS"}
          </button>
        </form>

        {(error || connectionError) && (
          <p className="error" role="alert">
            {error || connectionError}
          </p>
        )}

        {result && (
          <section className="upload-result" aria-live="polite">
            <h2>上传成功</h2>
            <dl>
              <div>
                <dt>文件</dt>
                <dd>{result.name}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{formatSize(result.size)}</dd>
              </div>
              <div>
                <dt>对象路径</dt>
                <dd>
                  <code>{result.key}</code>
                </dd>
              </div>
              <div>
                <dt>上传方式</dt>
                <dd>
                  浏览器直传 COS
                </dd>
              </div>
            </dl>
            <a
              className="download-link"
              href={result.url}
              target="_blank"
              rel="noreferrer"
            >
              下载文件验证 ↗
            </a>
            <p className="hint">
              上传凭证 {result.uploadExpiresIn / 60} 分钟内有效；下载链接 {result.expiresIn / 60} 分钟内有效。
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
