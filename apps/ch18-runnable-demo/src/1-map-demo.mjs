import "@knowledge/course-utils/env";
import { model } from "@knowledge/ai-utils";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
} from "@langchain/core/prompts";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import chalk from "chalk";
import { readMcpConfig } from "@knowledge/course-utils/mcp-config";
import {
  RunnableBranch,
  RunnableLambda,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";

const mcpConfig = await readMcpConfig();
const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    ...mcpConfig.mcpServers,
    "amap-maps-streamableHTTP": {
      url: `https://mcp.amap.com/mcp?key=${process.env.AMAP_MAPS_API_KEY}`,
    },
  },
});

const tools = await mcpClient.getTools();
const mcpResources = await mcpClient.listResources();
let resourceContent = "";
for (const [serverName, resources] of Object.entries(mcpResources)) {
  for (const resource of resources) {
    const content = await mcpClient.readResource(serverName, resource.uri);
    resourceContent += content[0].text;
  }
}

// 将 MCP tools 提供给模型，由模型自行判断是否需要调用工具。
const modelWithTools = model.bindTools(tools);

const promptTemplate = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(
    "你是一个可以调用 MCP 工具的智能助手",
  ),
  // 接收 messages 字段数据
  new MessagesPlaceholder("messages"),
]);

const llmChain = promptTemplate.pipe(modelWithTools);

// 1. 工具调用
const toolExecutor = new RunnableLambda({
  func: async (input) => {
    const { response, tools } = input;
    const toolResults = [];

    for (const toolCall of response.tool_calls) {
      const mcpTool = tools.find((tool) => tool.name === toolCall.name);
      if (mcpTool) {
        const toolRes = await mcpTool.invoke(toolCall.args);

        // 确保 content 为字符串
        const contenStr =
          typeof toolRes === "string"
            ? toolRes
            : toolRes?.text || JSON.stringify(toolRes);

        toolResults.push(
          new ToolMessage({
            content: contenStr,
            tool_call_id: toolCall.id,
          }),
        );
      }
    }

    return toolResults;
  },
});

// 2. 对结果的处理
const agentStepChain = RunnableSequence.from([
  // 1. 将 LLM 输出挂到 state.response 上
  RunnablePassthrough.assign({
    response: llmChain,
  }),
  // 2. 根据是否有 tool_calls 走不同的分支
  RunnableBranch.from([
    // 分支1：如果没有 tool_calls，本次调用已完成
    [
      ({ response }) => !response?.tool_calls || !response.tool_calls.length,
      new RunnableLambda({
        func: async (state) => {
          const { messages, response } = state;
          const newMessages = [...messages, response];
          return {
            ...state,
            messages: newMessages,
            done: true,
            final: response.content,
          };
        },
      }),
    ],
    // 默认分支：有 tool_calls，调用工具
    RunnableSequence.from([
      // 组装 messages
      new RunnableLambda({
        func: async (state) => {
          const { messages, response } = state;
          console.log(
            chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`),
          );
          console.log(
            chalk.bgBlue(
              `🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(", ")}`,
            ),
          );

          return {
            ...state,
            // 把模型调用结果添加到 messages
            messages: [...messages, response],
          };
        },
      }),
      // 调用工具执行器，得到 toolMessages
      RunnablePassthrough.assign({
        toolMessages: toolExecutor,
      }),
      // 将 toolMessages 添加到 messages
      new RunnableLambda({
        func: async (state) => {
          const { messages, toolMessages } = state;
          return {
            ...state,
            messages: [...messages, ...toolMessages],
            done: false,
          };
        },
      }),
    ]),
  ]),
]);

const runCase = async (input, maxIterations = 30) => {
  let state = {
    messages: [new HumanMessage(input)],
    done: false,
    final: null,
    tools,
  };

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));

    state = await agentStepChain.invoke(state);

    if (state.done) {
      console.log(`\n✨ AI 最终回复:\n${state.final}\n`);
      return state.final;
    }
  }

  return state.messages[state.messages.length - 1].content;
};

try {
  // await runCase("北京南站附近的酒店，以及去的路线");
  // await runCase(
  //   "北京南站附近的3个酒店，以及去的路线，路线规划生成文档保存到 /Users/axin/Desktop/knowlege-agent/apps/ch07-mcp-external/output 的一个 md 文件",
  // );
  await runCase(
    "北京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名",
  );
} finally {
  // 关闭 MCP Client，结束进程
  mcpClient.close();
}
