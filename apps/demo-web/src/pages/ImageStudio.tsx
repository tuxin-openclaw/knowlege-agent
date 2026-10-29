import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import imageApi from "@/api/images";
import type { Generation } from "@/api/images";
import uploadApi from "@/api/uploads";
import { modelConfigs } from "@/api/model-configs";
import type { ModelConfig } from "@/api/model-configs";
import "@/App.css";

interface Reference {
  key: string;
  url: string;
  name: string;
}

const statusLabels = {
  queued: "等待生成",
  generating: "正在绘制",
  succeeded: "已完成",
  failed: "生成失败",
};
const examples = [
  "雨后街角的咖啡店，暖色灯光，胶片摄影",
  "一只在月球散步的橘猫，童话插画",
  "把参考图变成柔和的水彩画，保留主体细节",
];

function App() {
  const [tab, setTab] = useState<"create" | "history">("create");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [reference, setReference] = useState<Reference | null>(null);
  const [items, setItems] = useState<Generation[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Generation | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const pending = items.filter(
    (item) => item.status === "queued" || item.status === "generating",
  ).length;
  const input = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    try {
      const page = await imageApi.getHistory();
      if (!page) return;
      setItems((previous) => {
        const merged = new Map(previous.map((item) => [item.id, item]));
        for (const item of page.items) merged.set(item.id, item);
        return [...merged.values()].sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        );
      });
      setCursor((previous) =>
        previous === undefined ? page.nextCursor : previous,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 生图模型来自“模型配置”页面，默认选中默认模型。
  useEffect(() => {
    void (async () => {
      try {
        const list = (await modelConfigs.list()).filter(
          (config) => config.kind === "image",
        );
        setModels(list);
        // 选中的模型被删除时回退到默认生图模型。
        const fallback =
          (list.find((config) => config.isDefault) ?? list[0])?.id ?? "";
        setModelId((current) =>
          list.some((config) => config.id === current) ? current : fallback,
        );
      } catch {
        // 加载失败时页面仍可浏览历史作品，提交时会收到服务端提示。
      } finally {
        setModelsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    const interval = pending > 0 ? 5000 : 30000;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, interval);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, refresh]);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);

  function chooseFile(chosen?: File) {
    if (!chosen) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(chosen.type) ||
      chosen.size === 0 ||
      chosen.size > 10 * 1024 * 1024
    ) {
      setError("请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片");
      return;
    }
    setError("");
    setFile(chosen);
    setLocalPreview(URL.createObjectURL(chosen));
    setReference(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || submitting || !modelId) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      let key = reference?.key;
      if (file) {
        const upload = await uploadApi.prepare(file);
        if (!upload) return;
        const uploaded = await uploadApi.upload(file, upload);
        if (!uploaded) return;
        key = upload.key;
        setReference({ key, url: upload.url, name: file.name });
        setFile(null);
        setLocalPreview("");
      }
      const job = await imageApi.create(prompt.trim(), key, modelId);
      if (!job) return;
      if (job.referenceKey && job.referenceUrl) {
        setReference((previous) => ({
          key: job.referenceKey!,
          url: job.referenceUrl!,
          name: previous?.name || "参考图",
        }));
      }
      setItems((previous) => [
        job,
        ...previous.filter((item) => item.id !== job.id),
      ]);
      setNotice("已加入生成队列，可在作品中查看进度");
      setTab("history");
      void refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await imageApi.getHistory(cursor);
      if (!page) return;
      setItems((previous) => [
        ...previous,
        ...page.items.filter(
          (item) => !previous.some((old) => old.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function reuse(item: Generation) {
    setPrompt(item.prompt);
    setFile(null);
    setLocalPreview("");
    setReference(
      item.referenceKey && item.referenceUrl
        ? { key: item.referenceKey, url: item.referenceUrl, name: "历史参考图" }
        : null,
    );
    setError("");
    setNotice("");
    setSelected(null);
    setTab("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => promptInput.current?.focus(), 100);
  }

  const preview = file ? localPreview : reference?.url;

  return (
    <div className="studio">
      <header className="studio-header">
        <a className="brand" href="/" aria-label="灵感成像首页">
          <span className="brand-symbol">✳</span> 灵感成像
        </a>
        <span className="header-tag">AI IMAGE STUDIO</span>
      </header>
      <main>
        <nav className="tabs" aria-label="工作台">
          <button
            className={tab === "create" ? "active" : ""}
            onClick={() => setTab("create")}
          >
            开始创作
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            我的作品 {pending > 0 && <span className="count">{pending}</span>}
          </button>
        </nav>
        <div className="workspace">
          <section
            className={`composer panel ${tab !== "create" ? "mobile-hidden" : ""}`}
            aria-label="图片创作"
          >
            <div className="section-title">
              <h2>描述你的画面</h2>
              <span className="step">01 / CREATE</span>
            </div>
            <form onSubmit={submit}>
              <label htmlFor="prompt" className="sr-only">
                图片描述
              </label>
              <textarea
                id="prompt"
                ref={promptInput}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={4000}
                required
                disabled={submitting}
                placeholder="想画些什么？描述主体、风格、光线与氛围…"
                rows={5}
              />
              <div className="prompt-meta">
                <span>细节越具体，画面越贴近想象</span>
                <span>{prompt.length}/4000</span>
              </div>
              <div className="inspirations" aria-label="灵感示例">
                {examples.map((example, index) => (
                  <button
                    key={example}
                    type="button"
                    disabled={submitting}
                    onClick={() => setPrompt(example)}
                  >
                    {["胶片街景", "童话插画", "水彩改绘"][index]} ↗
                  </button>
                ))}
              </div>
              <div className="model-select-block">
                {models.length ? (
                  <>
                    <div className="reference-heading">
                      <label htmlFor="image-model">生图模型</label>
                      <span>由“模型配置”页面维护</span>
                    </div>
                    <select
                      id="image-model"
                      className="model-select"
                      value={modelId}
                      disabled={submitting}
                      onChange={(event) => setModelId(event.target.value)}
                    >
                      {models.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.name} · {config.model}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="model-hint" role="status">
                    {modelsLoaded ? (
                      <>
                        还没有可用的生图模型，请先到{" "}
                        <a href="/model-configs">模型配置</a> 添加一个图片模型。
                      </>
                    ) : (
                      "正在加载生图模型…"
                    )}
                  </p>
                )}
              </div>
              <div className="reference-heading">
                <label htmlFor="reference">参考图片</label>
                <span>可选 · 图文一起创作</span>
              </div>
              <input
                ref={input}
                id="reference"
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={submitting}
                onChange={(event) => {
                  chooseFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {preview ? (
                <div className="reference-preview">
                  <img src={preview} alt="已选择的参考图片" />
                  <div>
                    <strong>{file?.name || reference?.name}</strong>
                    <button
                      className="text-button"
                      type="button"
                      disabled={submitting}
                      onClick={() => input.current?.click()}
                    >
                      更换图片
                    </button>
                  </div>
                  <button
                    className="remove-button"
                    type="button"
                    aria-label="移除参考图片"
                    disabled={submitting}
                    onClick={() => {
                      setFile(null);
                      setLocalPreview("");
                      setReference(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="reference-picker"
                  disabled={submitting}
                  onClick={() => input.current?.click()}
                >
                  <span className="upload-plus">＋</span>
                  <strong>添加参考图</strong>
                  <span>相册选图 · PNG / JPEG / WebP · 最大 10 MB</span>
                </button>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="success" role="status">
                  {notice}
                </p>
              )}
              <button
                className="generate-button"
                disabled={!prompt.trim() || submitting || !modelId}
                type="submit"
              >
                {submitting ? (
                  <>
                    <span className="spinner" />
                    正在提交…
                  </>
                ) : (
                  <>
                    ✧ &nbsp; {reference || file ? "结合参考图生成" : "生成图片"}
                  </>
                )}
              </button>
              <p className="composer-hint">生成结果会自动保存在作品中</p>
            </form>
          </section>
          <section
            className={`history ${tab !== "history" ? "mobile-hidden" : ""}`}
            aria-label="生图历史"
          >
            <div className="section-title">
              <div>
                <span className="eyebrow">YOUR COLLECTION</span>
                <h2>每一次灵感，都有迹可循</h2>
              </div>
              <button
                className="refresh-button"
                onClick={() => void refresh()}
                aria-label="刷新作品"
              >
                ↻
              </button>
            </div>
            {loading ? (
              <div className="empty-state">
                <span className="spinner" />
                <p>正在加载作品…</p>
              </div>
            ) : items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-art">✧</div>
                <h3>第一张作品，等你来创作</h3>
                <p>输入一段描述，开启你的灵感画廊。</p>
                <button
                  className="text-button"
                  onClick={() => setTab("create")}
                >
                  去创作 ↗
                </button>
              </div>
            ) : (
              <div className="gallery">
                {items.map((item) => (
                  <article key={item.id} className="generation-card">
                    {item.status === "succeeded" && item.imageUrl ? (
                      <button
                        className="artwork-button"
                        onClick={() => setSelected(item)}
                        aria-label={`预览：${item.prompt}`}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.prompt}
                          loading="lazy"
                        />
                        <span className="expand-label">查看大图 ↗</span>
                      </button>
                    ) : (
                      <div
                        className={`artwork-placeholder ${item.status === "failed" ? "failed" : ""}`}
                      >
                        {item.status === "failed" ? (
                          <span className="failed-mark">!</span>
                        ) : (
                          <span className="spinner" />
                        )}
                        <strong>{statusLabels[item.status]}</strong>
                        <span>
                          {item.error ||
                            (item.status === "queued"
                              ? "灵感已收到，请稍候"
                              : "画面正在慢慢成形")}
                        </span>
                      </div>
                    )}
                    <div className="card-content">
                      <div className="card-meta">
                        <time dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                        <span title={`模型：${item.model}`}>
                          {item.referenceKey ? "图文生图" : "文字生图"} ·{" "}
                          {item.model}
                        </span>
                      </div>
                      <p className="card-prompt">{item.prompt}</p>
                      <button
                        className="text-button"
                        onClick={() => reuse(item)}
                      >
                        {item.status === "failed" ? "重新创作" : "使用此描述"} ↗
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {cursor && (
              <button
                className="load-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "加载中…" : "加载更多作品"}
              </button>
            )}
          </section>
        </div>
      </main>
      <footer className="studio-footer">
        让每一个小小的想法，都拥有自己的画面。
      </footer>
      <dialog
        ref={dialog}
        className="preview-dialog"
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <div className="preview-content">
            <div className="preview-toolbar">
              <span>作品预览</span>
              <button
                className="remove-button"
                onClick={() => setSelected(null)}
                aria-label="关闭预览"
              >
                ×
              </button>
            </div>
            <img src={selected.imageUrl || ""} alt={selected.prompt} />
            <p>{selected.prompt}</p>
            <div className="preview-actions">
              <button className="text-button" onClick={() => reuse(selected)}>
                使用此描述 ↗
              </button>
              <a
                href={selected.imageUrl || ""}
                target="_blank"
                rel="noreferrer"
              >
                查看原图 ↗
              </a>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
export default App;
