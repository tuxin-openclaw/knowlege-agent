// child_process 子进程管理模块
import { spawn } from "node:child_process";

const command = "ls -la";
const cwd = process.cwd();

const [cmd, ...args] = command.split(" ");

// 启动子进程并执行命令
const child = spawn(cmd, args, {
  cwd,
  stdio: "inherit", // 实时输出到控制台
  shell: true, // shell 模式
});

let errMsg = "";

child.on("error", (err) => {
  errMsg = err.message;
});

child.on("close", (code) => {
  if (code === 0) {
    process.exit(0);
  }
  if (errMsg) {
    console.error(`[错误] ${errMsg}`);
  }
  process.exit(code || 1);
});
