import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { readFile } from "node:fs/promises";
import chalk from "chalk";

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const readMcpConfig = async () => {
  const MCP_CONFIG_PATH = new URL("../.vscode/mcp.json", import.meta.url);
  const content = await readFile(MCP_CONFIG_PATH, "utf-8");
  return JSON.parse(content);
};
const mcpConfig = await readMcpConfig();
const mcpClient = new MultiServerMCPClient({
  mcpServers: mcpConfig.mcpServers,
});

const mcpTools = await mcpClient.getTools();
const mcpResources = await mcpClient.listResources();
let resourceContent = "";
for (const [serverName, resources] of Object.entries(mcpResources)) {
  for (const resource of resources) {
    const content = await mcpClient.readResource(serverName, resource.uri);
    resourceContent += content[0].text;
  }
}

// 将 MCP tools 提供给模型，由模型自行判断是否需要调用工具。
const modelWithTools = model.bindTools(mcpTools);

const runCase = async (input, maxIterations = 30) => {
  const messages = [
    new SystemMessage(resourceContent),
    new HumanMessage(input),
  ];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls?.length) {
      console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
      return response.content;
    }

    for (const toolCall of response.tool_calls) {
      const mcpTool = mcpTools.find((tool) => tool.name === toolCall.name);
      if (mcpTool) {
        const result = await mcpTool.invoke(toolCall.args);

        messages.push(
          new ToolMessage({
            content: result,
            tool_call_id: toolCall.id,
          }),
        );
      }
    }
  }

  return messages[messages.length - 1].content;
};

try {
  // await runCase("请查询用户 002 的信息");
  await runCase("MCP Server 的使用指南是什么");
} finally {
  // 关闭 MCP Client，结束进程
  mcpClient.close();
}
