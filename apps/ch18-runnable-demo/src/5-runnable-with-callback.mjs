import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

const trimRunnable = RunnableLambda.from(async (input) =>
  input.trim(),
).withConfig({
  runName: "trimInput",
});

const upperCaseRunnable = RunnableLambda.from(async (input) =>
  input.toUpperCase(),
).withConfig({
  runName: "upperCaseInput",
});

const formatRunnable = RunnableLambda.from(
  async (input) => `处理结果: ${input}`,
).withConfig({
  runName: "formatResult",
});

const sequence = RunnableSequence.from([
  trimRunnable,
  upperCaseRunnable,
  formatRunnable,
]).withConfig({
  runName: "textProcessingSequence",
});

const logRunNames = new Map();
const logCallback = {
  handleChainStart: async (
    _chain,
    inputs,
    runId,
    _parentRunId,
    _tags,
    _metadata,
    _runType,
    runName,
  ) => {
    logRunNames.set(runId, runName);
    console.log(`▶️ ${runName} 开始执行:`, inputs);
  },
  handleChainEnd: async (outputs, runId) => {
    const runName = logRunNames.get(runId);
    console.log(`✅ ${runName} 执行完成:`, outputs);
  },
  handleChainError: async (error) => {
    console.log("❌ 执行失败:", error.message);
  },
};

const auditRunNames = new Map();
const auditCallback = {
  handleChainStart: async (
    _chain,
    inputs,
    runId,
    _parentRunId,
    _tags,
    _metadata,
    _runType,
    runName,
  ) => {
    auditRunNames.set(runId, runName);
    console.log(`📝 ${runName} 审计输入:`, inputs);
  },
  handleChainEnd: async (outputs, runId) => {
    const runName = auditRunNames.get(runId);
    console.log(`📝 ${runName} 审计输出:`, outputs);
  },
};

const result = await sequence.invoke("  hello runnable  ", {
  callbacks: [logCallback, auditCallback],
});

console.log("🚀 最终结果:", result);
