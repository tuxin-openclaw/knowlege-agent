import { useCallback, useEffect, useRef, useState } from "react";
import { modelUsage } from "@/api/model-usage";
import type { Call, Summary } from "@/api/model-usage";
import { Link } from "react-router-dom";
import "@/model-usage.css";

const statuses: Record<Call["status"], string> = {
  pending: "待确认",
  succeeded: "成功",
  failed: "失败",
  unknown: "结果未知",
};
const number = (value: string | number | null) =>
  value == null ? "未知" : BigInt(value).toLocaleString("zh-CN");
const money = (value: string | null) =>
  value == null
    ? "—"
    : `¥${value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;
const dateTime = (day: string, nextDay = false) => {
  const date = new Date(`${day}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
};

export default function ModelUsage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const requestId = useRef(0);
  const fetchData = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      if (from && to && from > to) throw new Error("开始日期不能晚于结束日期");
      const params = new URLSearchParams();
      if (from) params.set("from", dateTime(from));
      if (to) params.set("to", dateTime(to, true));
      if (kind) params.set("kind", kind);
      if (provider.trim())
        params.set("provider", provider.trim().replace(/\/+$/, ""));
      if (model.trim()) params.set("model", model.trim());
      if (status) params.set("status", status);
      const detail = await modelUsage.dashboard(
        `${params.toString()}&page=${page}`,
      );
      if (id !== requestId.current) return;
      setSummary(detail.summary);
      setItems(detail.items);
      setTotal(detail.total);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : "加载失败");
      setSummary(null);
      setItems([]);
      setTotal(0);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [from, to, kind, provider, model, status, page, version]);
  useEffect(() => {
    void fetchData();
    return () => {
      requestId.current++;
    };
  }, [fetchData]);
  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <main className="usage-page">
      <div className="usage-toolbar">
        <button onClick={() => setVersion((v) => v + 1)} disabled={loading}>
          刷新
        </button>
        <Link to="/model-configs">在模型配置里填单价 →</Link>
      </div>
      <section className="usage-filters">
        <label>
          开始日期
          <input
            type="date"
            value={from}
            onChange={(e) => change(setFrom, e.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={to}
            onChange={(e) => change(setTo, e.target.value)}
          />
        </label>
        <label>
          类型
          <select
            value={kind}
            onChange={(e) => change(setKind, e.target.value)}
          >
            <option value="">全部</option>
            <option value="text">文本</option>
            <option value="image">图片</option>
          </select>
        </label>
        <label>
          状态
          <select
            value={status}
            onChange={(e) => change(setStatus, e.target.value)}
          >
            <option value="">全部</option>
            {Object.entries(statuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          服务商地址
          <input
            value={provider}
            onChange={(e) => change(setProvider, e.target.value)}
            placeholder="完整 API 根地址"
          />
        </label>
        <label>
          模型名称
          <input
            value={model}
            onChange={(e) => change(setModel, e.target.value)}
            placeholder="精确匹配"
          />
        </label>
      </section>
      {error && (
        <div className="usage-error" role="alert">
          {error}
        </div>
      )}
      {summary && (
        <>
          <div className="usage-cards">
            <div>
              <span>调用次数</span>
              <strong>{summary.calls}</strong>
              <small>
                成功 {summary.succeeded} · 失败 {summary.failed} · 待确认{" "}
                {summary.unconfirmed}
              </small>
            </div>
            <div>
              <span>输入 / 输出 Token</span>
              <strong>
                {number(summary.input_tokens)} / {number(summary.output_tokens)}
              </strong>
              <small>总计 {number(summary.total_tokens)} Token</small>
            </div>
            <div>
              <span>生成图片</span>
              <strong>{number(summary.image_count)} 张</strong>
              <small>只统计服务商明确返回的数量</small>
            </div>
            <div>
              <span>估算费用</span>
              <strong>
                {summary.calls === summary.cost_unknown
                  ? "—"
                  : money(summary.estimated_cost)}
              </strong>
              <small>{summary.cost_unknown} 次未计入费用</small>
            </div>
          </div>
          <p className="usage-note">
            {summary.usage_unknown} 次用量未知，{summary.unconfirmed}{" "}
            次结果待确认；汇总仅包含已知数据。待确认记录可能包括运行中或因中断无法确认的调用。
          </p>
        </>
      )}
      <section className="usage-table">
        <h2>
          调用明细 <span>{total}</span>
        </h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>类型 / 模型</th>
                <th>服务商</th>
                <th>状态 / 耗时</th>
                <th>用量</th>
                <th>估算费用</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.started_at).toLocaleString("zh-CN")}</td>
                  <td>
                    {item.kind === "text" ? "文本" : "图片"}
                    <br />
                    <strong>{item.model}</strong>
                  </td>
                  <td className="provider-cell">{item.provider}</td>
                  <td>
                    {statuses[item.status]}
                    <br />
                    <small>
                      {item.duration_ms === null
                        ? "耗时未知"
                        : `${number(item.duration_ms)} ms`}
                    </small>
                  </td>
                  <td>
                    {item.kind === "image" ? (
                      `${number(item.image_count)} 张`
                    ) : (
                      <>
                        输入 {number(item.input_tokens)} / 输出{" "}
                        {number(item.output_tokens)}
                        <br />
                        <small>
                          总计 {number(item.total_tokens)} · 缓存{" "}
                          {number(item.cached_tokens)} · 思考{" "}
                          {number(item.reasoning_tokens)}
                        </small>
                      </>
                    )}
                  </td>
                  <td>
                    {item.cost_status === "known"
                      ? money(item.estimated_cost)
                      : item.cost_status === "unconfigured"
                        ? "未填单价"
                        : "未知"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && !loading && !error && (
          <p className="usage-empty">当前条件下没有调用记录</p>
        )}
        <div className="usage-pagination">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span>
            第 {page} 页 · 共 {total} 条
          </span>
          <button
            disabled={page * 20 >= total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </section>
    </main>
  );
}
