import { RunnableLambda } from "@langchain/core/runnables";

let attempt = 0;

const unstableRunnable = RunnableLambda.from(async (input) => {
  attempt++;

  // 模拟概率失败
  if (Math.random() > 0.5) {
    console.log("模拟的随机错误");
    throw new Error("模拟的随机错误");
  }

  console.log(`第 ${attempt} 次尝试处理数据 ${input}`);
  return `成功处理: ${input}`;
});

const firstFallback = RunnableLambda.from(async (input) => {
  console.log("主 Runnable 失败，执行第一个 fallback");
  throw new Error("第一个 fallback 也失败了");
});

const secondFallback = RunnableLambda.from(async (input) => {
  console.log("第一个 fallback 失败，执行第二个 fallback");
  return `最终降级处理: ${input}`;
});

const runnableWithFallbacks = unstableRunnable.withFallbacks({
  fallbacks: [firstFallback, secondFallback],
});

try {
  const result = await runnableWithFallbacks.invoke("演示 fallback");
  console.log("🚀 ~ result:", result);
} catch (error) {
  console.log("❌ ~ error:", error);
}
