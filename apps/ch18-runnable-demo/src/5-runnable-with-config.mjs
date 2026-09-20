import { RunnableLambda } from "@langchain/core/runnables";

const roleBasedRunnable = RunnableLambda.from(async (input, config) => {
  const role = config?.configurable?.role;

  if (role === "admin") {
    return `管理员处理 ${input}：允许执行全部操作`;
  }

  if (role === "user") {
    return `普通用户处理 ${input}：只允许执行普通操作`;
  }

  throw new Error(`不支持的角色: ${role}`);
});

const adminRunnable = roleBasedRunnable.withConfig({
  runName: "adminRunnable",
  configurable: {
    role: "admin",
  },
});

const userRunnable = roleBasedRunnable.withConfig({
  runName: "userRunnable",
  configurable: {
    role: "user",
  },
});

console.log(await adminRunnable.invoke("查看系统设置"));
console.log(await userRunnable.invoke("查看系统设置"));
