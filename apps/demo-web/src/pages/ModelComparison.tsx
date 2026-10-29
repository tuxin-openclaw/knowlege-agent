import { useEffect, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import type { AssistantMessage } from "@ag-ui/core";
import { CopilotChatAssistantMessage } from "@copilotkit/react-core/v2";
import { Link } from "react-router-dom";
import { modelConfigs } from "@/api/model-configs";
import type { ModelConfig } from "@/api/model-configs";
import "@copilotkit/react-core/v2/styles.css";
import "@/model-comparison.css";

type Panel = {
  id: string;
  /** 任务使用的文本模型配置；来自页面“模型配置”。 */
  modelId: string;
  temperature: number;
  topP: number;
  thinking: boolean;
  running: boolean;
  output: string;
  error: string;
  completed: boolean;
};
const makePanel = (modelId = ""): Panel => ({
  id: crypto.randomUUID(),
  modelId,
  temperature: 1,
  topP: 1,
  thinking: false,
  running: false,
  output: "",
  error: "",
  completed: false,
});

export default function ModelComparison() {
  const [prompt, setPrompt] = useState("");
  const [panels, setPanels] = useState<Panel[]>(() => [makePanel()]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelError, setModelError] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const agents = useRef(new Map<string, HttpAgent>());
  const defaultModelId =
    models.find((config) => config.isDefault)?.id ?? models[0]?.id ?? "";
  useEffect(() => {
    void (async () => {
      try {
        const list = (await modelConfigs.list()).filter(
          (config) => config.kind === "text",
        );
        setModels(list);
        // 补齐没有选择的任务，并把已被删除的模型换回默认模型。
        const fallback =
          (list.find((config) => config.isDefault) ?? list[0])?.id ?? "";
        setPanels((previous) =>
          previous.map((panel) =>
            list.some((config) => config.id === panel.modelId)
              ? panel
              : { ...panel, modelId: fallback },
          ),
        );
      } catch (error) {
        setModelError(
          error instanceof Error ? error.message : "加载模型配置失败",
        );
      } finally {
        setModelsLoaded(true);
      }
    })();
  }, []);
  useEffect(
    () => () => {
      for (const agent of agents.current.values()) agent.abortRun();
      agents.current.clear();
    },
    [],
  );
  function update(id: string, changes: Partial<Panel>) {
    setPanels((previous) =>
      previous.map((panel) =>
        panel.id === id ? { ...panel, ...changes } : panel,
      ),
    );
  }
  function remove(id: string) {
    agents.current.get(id)?.abortRun();
    agents.current.delete(id);
    setPanels((previous) => previous.filter((panel) => panel.id !== id));
  }
  async function run(panel: Panel, text: string) {
    if (!text.trim() || !panel.modelId || agents.current.has(panel.id)) return;
    const agent = new HttpAgent({
      url: "/api/model-comparison/run",
      fetch: async (url, init) => {
        const response = await fetch(url, init);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.message === "string"
              ? body.message
              : "请求失败，请检查服务状态",
          );
        }
        return response;
      },
    });
    agents.current.set(panel.id, agent);
    agent.setState({
      modelId: panel.modelId,
      temperature: panel.temperature,
      top_p: panel.topP,
      thinking: panel.thinking,
    });
    agent.setMessages([
      { id: crypto.randomUUID(), role: "user", content: text.trim() },
    ]);
    update(panel.id, {
      running: true,
      output: "",
      error: "",
      completed: false,
    });
    let errorMessage = "";
    let output = "";
    try {
      await agent.runAgent(
        {},
        {
          onTextMessageContentEvent: ({ event }) => {
            output += event.delta;
            update(panel.id, { output });
          },
          onRunErrorEvent: ({ event }) => {
            errorMessage = event.message;
          },
        },
      );
      if (agents.current.get(panel.id) === agent)
        update(panel.id, { error: errorMessage, completed: !errorMessage });
    } catch (error) {
      if (agents.current.get(panel.id) === agent) {
        const message =
          error instanceof Error ? error.message : "请求失败，请检查服务状态";
        update(panel.id, { error: errorMessage || message });
      }
    } finally {
      if (agents.current.get(panel.id) === agent) {
        agents.current.delete(panel.id);
        update(panel.id, { running: false });
      }
    }
  }
  return (
    <div className="comparison-page">
      <section className="prompt-card">
        <div className="section-label">
          <div>
            <strong>共享提示词</strong>
            <span>所有任务使用相同的问题，独立生成回答。</span>
          </div>
          <span>{prompt.length} / 20000</span>
        </div>
        <textarea
          maxLength={20000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="输入你想让模型回答的问题，例如：用三种不同的方式描述一场夏雨。"
          rows={4}
        />
        <div className="prompt-actions">
          <span>模型输出有随机性，相同参数也可能得到不同回答。</span>
          <button
            className="primary-button"
            disabled={
              !prompt.trim() ||
              !models.length ||
              panels.length === 0 ||
              panels.every((panel) => panel.running)
            }
            onClick={() =>
              panels.forEach((panel) => {
                if (!panel.running) void run(panel, prompt);
              })
            }
          >
            ▶ 生成全部
          </button>
        </div>
      </section>
      {(modelError || (modelsLoaded && !models.length)) && (
        <div className="model-warning" role="alert">
          <span>
            {modelError ? (
              modelError
            ) : (
              <>
                还没有可用的文本模型，请先到{" "}
                <Link to="/model-configs">模型配置</Link> 添加一个文本模型。
              </>
            )}
          </span>
        </div>
      )}
      <div className="panels-heading">
        <div>
          <h2>
            对比任务 <span>{panels.length}</span>
          </h2>
          <p>为每个任务选择模型和参数，然后单独或一起生成。</p>
        </div>
        <button
          className="add-button"
          onClick={() =>
            setPanels((previous) => [...previous, makePanel(defaultModelId)])
          }
        >
          ＋ 新增任务
        </button>
      </div>
      {panels.length === 0 && (
        <div className="empty-panels">还没有任务，点击“新增任务”开始对比。</div>
      )}
      <div className="panel-grid">
        {panels.map((panel, index) => {
          const number = index + 1;
          return (
            <article className="task-card" key={panel.id}>
              <div className="task-heading">
                <div>
                  <span className="task-number">
                    {String(number).padStart(2, "0")}
                  </span>
                  <strong>任务 {number}</strong>
                </div>
                <button
                  className="remove-button"
                  onClick={() => remove(panel.id)}
                  aria-label={`删除任务 ${number}`}
                >
                  ×
                </button>
              </div>
              <div className="model-picker">
                <label htmlFor={`model-${panel.id}`}>模型</label>
                <select
                  id={`model-${panel.id}`}
                  value={panel.modelId}
                  disabled={panel.running || !models.length}
                  onChange={(event) =>
                    update(panel.id, { modelId: event.target.value })
                  }
                >
                  {!models.length && <option value="">尚未配置文本模型</option>}
                  {models.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name} · {config.model}
                    </option>
                  ))}
                </select>
              </div>
              <div className="thinking-control">
                <div>
                  <strong>思考模式</strong>
                  <small>
                    {panel.thinking
                      ? "DeepSeek 思考模式下 Temperature 不生效"
                      : "关闭思考模式可测试 Temperature"}
                  </small>
                </div>
                <label className="thinking-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`任务 ${number} 思考模式`}
                    checked={panel.thinking}
                    disabled={panel.running}
                    onChange={(event) =>
                      update(panel.id, { thinking: event.target.checked })
                    }
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
              <div className="parameters">
                <label>
                  <span>
                    Temperature <b>{panel.temperature.toFixed(1)}</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={panel.temperature}
                    disabled={panel.running}
                    onChange={(event) =>
                      update(panel.id, {
                        temperature: Number(event.target.value),
                      })
                    }
                  />
                  <small>越高，输出通常越有变化</small>
                </label>
                <label>
                  <span>
                    Top P <b>{panel.topP.toFixed(2)}</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={panel.topP}
                    disabled={panel.running}
                    onChange={(event) =>
                      update(panel.id, { topP: Number(event.target.value) })
                    }
                  />
                  <small>控制采样时考虑的词的范围</small>
                </label>
              </div>
              <div className="output-heading">
                <strong>模型输出</strong>
                <span className={panel.running ? "status running" : "status"}>
                  {panel.running
                    ? "● 生成中"
                    : panel.error
                      ? "生成失败"
                      : panel.completed
                        ? "已完成"
                        : "等待生成"}
                </span>
              </div>
              <div className="task-output" aria-live="polite">
                {panel.output ? (
                  <CopilotChatAssistantMessage
                    message={
                      {
                        id: panel.id,
                        role: "assistant",
                        content: panel.output,
                      } as AssistantMessage
                    }
                    isRunning={panel.running}
                    toolbarVisible={false}
                    toolCallsView={() => null}
                  />
                ) : (
                  !panel.error && (
                    <div className="output-placeholder">
                      {panel.running
                        ? "正在等待模型响应…"
                        : "生成后，回答将显示在这里"}
                    </div>
                  )
                )}
                {panel.error && (
                  <div className="task-error" role="alert">
                    {panel.error}
                  </div>
                )}
              </div>
              <button
                className="run-button"
                disabled={!prompt.trim() || !panel.modelId || panel.running}
                onClick={() => void run(panel, prompt)}
              >
                {panel.running ? "生成中…" : "生成回答 ↗"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
