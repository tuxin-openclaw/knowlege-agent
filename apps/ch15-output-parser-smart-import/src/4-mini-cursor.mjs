/**
 * @title mini-cursor
 * @description 不支持 GLM 模型，输出格式不一致
 */
import "@knowledge/course-utils/env";
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
} from "./utils/tools.mjs";
import chalk from "chalk";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";

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
  const history = new InMemoryChatMessageHistory();

  await history.addMessage(new SystemMessage(SYSTEM_MSG));
  await history.addMessage(new HumanMessage(input));

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`\n⏳ 正在等待 AI 思考...`));

    const messages = await history.getMessages();

    const rawStream = await modelWithTools.stream(messages);

    let fullAIMessage = null;

    const toolParser = new JsonOutputToolsParser();
    // 记录每个工具调用已打印的长度（用 id 或 filePath 作为 key）
    const printedLengths = new Map();

    for await (const chunk of rawStream) {
      fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;

      let parsedTools = null;
      try {
        // 用 JsonOutputToolsParser 来解析 tool_call_chunks
        parsedTools = await toolParser.parseResult([
          { message: fullAIMessage },
        ]);
      } catch (error) {
        console.log("❌ ~ runAgentWithTools ~ error:", error);
      }

      if (parsedTools?.length) {
        // 如果有解析出工具调用，记录每个工具调用已打印的长度
        for (const toolCall of parsedTools) {
          if (toolCall.type === "write_file" && toolCall.args?.content) {
            // 如果是写入文件的工具调用，且有 content 参数
            const toolCallId =
              toolCall.id || toolCall.args.filePath || "default";
            const currentContent = String(toolCall.args.content);
            const previousLength = printedLengths.get(toolCallId);

            if (previousLength === undefined) {
              printedLengths.set(toolCallId, 0);
              console.log(
                chalk.bgBlue(
                  `\n[工具调用] write_file("${toolCall.args.filePath}") - 开始写入（流式预览）\n`,
                ),
              );
            }

            if (currentContent.length > previousLength) {
              const newContent = currentContent.slice(previousLength);
              process.stdout.write(newContent);
              printedLengths.set(toolCallId, currentContent.length);
            }
          }
        }
      } else {
        // 还没有解析出工具调用时，如果有文本内容就直接输出
        const content =
          chunk.content || chunk.additional_kwargs?.reasoning_content;
        if (content) {
          process.stdout.write(
            typeof content === "string" ? content : JSON.stringify(content),
          );
        }
      }
    }

    // 此时 fullAIMessage 已完整，记录到历史
    await history.addMessage(fullAIMessage);
    console.log(chalk.green("\n✅ 消息已完整存入历史："));

    if (!fullAIMessage.tool_calls?.length) {
      // 工具调用结束
      console.log(`\n✨ AI 最终回复:\n${fullAIMessage.content}\n`);
      return fullAIMessage.content;
    }

    // 执行工具调用并将结果存入历史
    for (const toolCall of fullAIMessage.tool_calls) {
      const foundTool = tools.find((item) => item.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);
        await history.addMessage(
          new ToolMessage({
            content: toolResult,
            tool_call_id: toolCall.id,
          }),
        );
      }
    }
  }

  const finalMessages = await history.getMessages();
  // 遍历超出最大迭代次数依然没有返回，返回最后一条消息
  return finalMessages[finalMessages.length - 1].content;
};

const case1 = `创建一个功能丰富的 React TodoList 应用：

1. 创建项目：echo -e "n\nn" | pnpm create vite output/react-todo-app --template react-ts
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
启动成功后用浏览器打开
`;

try {
  await runAgentWithTools(case1);
} catch (error) {
  console.error(`\n❌ 错误: ${error}\n`);
}
