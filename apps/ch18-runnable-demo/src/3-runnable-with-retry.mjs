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

const runnableWithRetry = unstableRunnable.withRetry({
  // 最多尝试次数
  stopAfterAttempt: 5,
});

try {
  const result = await runnableWithRetry.invoke("演示失败重试");
  console.log("🚀 ~ result:", result);
} catch (error) {
  console.log("❌ ~ error:", error);
}
