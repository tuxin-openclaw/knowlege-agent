import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  executeCommandTool,
  listDirTool,
  readFileTool,
  writeFileTool,
} from "./6.2-tools.mjs";
import chalk from "chalk";

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0, // 温度越低, 输出越确定, 让模型严格遵守指令不要自己发挥
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const tools = [readFileTool, writeFileTool, executeCommandTool, listDirTool];
const modelWithTools = model.bindTools(tools);

const SYSTEM_MSG = `你是一个项目管理助手, 使用工具完成任务。

当前工作目录: ${process.cwd()}

工具：
1. read_file: 读取文件
2. write_file: 写入文件
3. execute_command: 执行命令（支持 dir 参数）
4. list_directory: 列出目录

重要规则 - execute_command：
- dir 参数会自动切换到指定目录
- 当使用 dir 时, 绝对不要在 command 中使用 cd
- 错误示例: { command: "cd react-todo-app && pnpm install", dir: "react-todo-app" }
- 这是错误的！因为 dir 已经在 react-todo-app 目录了, 再 cd react-todo-app 会找不到目录
- 正确示例: { command: "pnpm install", dir: "react-todo-app" }
这样就对了！dir 已经切换到 react-todo-app, 直接执行命令即可

回复要简洁, 只说做了什么`;

/**
 * Agent 执行函数
 * @param {*} input 用户输入
 * @param {*} maxIterations 最大工具调用次数
 */
const runAgentWithTools = async (input, maxIterations = 30) => {
  const messages = [new SystemMessage(SYSTEM_MSG), new HumanMessage(input)];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    const resp = await modelWithTools.invoke(messages);
    messages.push(resp);

    // 检查是否有工具调用
    if (!resp.tool_calls?.length) {
      // 轮询直到所有工具调用完成, 然后返回最终回复
      console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
      return resp.content;
    }

    // 执行工具调用
    for (const toolCall of resp.tool_calls) {
      const tool = tools.find((tool) => tool.name === toolCall.name);
      if (!tool) {
        console.error(`[错误] 找不到工具 ${toolCall.name}`);
        return;
      }
      const toolRes = await tool.invoke(toolCall.args);
      messages.push(
        new ToolMessage({
          content: toolRes,
          tool_call_id: toolCall.id,
        }),
      );
    }
  }

  // 超出最大次数, 返回最后一次 AI 回复
  return messages[messages.length - 1].content;
};

const case1 = `创建一个功能丰富的 React TodoList 应用：

1. 创建项目：echo -e "n\nn" | pnpm create vite demo/react-todo-app --template react-ts
2. 修改 src/App.tsx, 实现完整功能的 TodoList：
 - 添加、删除、编辑、标记完成
 - 分类筛选（全部/进行中/已完成）
 - 统计信息显示
 - localStorage 数据持久化
3. 添加复杂样式：
 - 渐变背景（蓝到紫）
 - 卡片阴影、圆角
 - 悬停效果
4. 添加动画：
 - 添加/删除时的过渡动画
 - 使用 CSS transitions
5. 列出目录确认

注意：使用 pnpm, 功能要完整, 样式要美观, 要有动画效果

之后在 react-todo-app 项目中：
1. 使用 pnpm install 安装依赖
2. 使用 pnpm run dev 启动服务器
`;

try {
  await runAgentWithTools(case1);
} catch (error) {
  console.error(`\n❌ 错误: ${error.message}\n`);
}
