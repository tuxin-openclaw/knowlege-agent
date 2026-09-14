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
const amapKey = process.env.AMAP_MAPS_API_KEY;
if (!amapKey) {
  throw new Error(
    "缺少环境变量 AMAP_MAPS_API_KEY，请在项目根目录的 .env 中配置高德地图 Key",
  );
}
mcpConfig.mcpServers["amap-maps-streamableHTTP"].url =
  `https://mcp.amap.com/mcp?key=${encodeURIComponent(amapKey)}`;

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

    console.log(
      chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`),
    );
    console.log(
      chalk.bgBlue(
        `🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(", ")}`,
      ),
    );
    for (const toolCall of response.tool_calls) {
      const mcpTool = mcpTools.find((tool) => tool.name === toolCall.name);
      if (mcpTool) {
        try {
          const toolRes = await mcpTool.invoke(toolCall.args);

          // 确保 content 为字符串
          let contenStr;
          if (typeof toolRes === "string") {
            contenStr = toolRes;
          } else if (toolRes?.text) {
            // mcp FileSystem 返回的 toolRes 为 { text: '...' }
            contenStr = toolRes.text;
          }
          messages.push(
            new ToolMessage({
              content: contenStr,
              tool_call_id: toolCall.id,
            }),
          );
        } catch (error) {
          console.error("MCP 工具调用失败：", {
            name: toolCall.name,
            args: toolCall.args,
            message: error.message,
            code: error.code,
            status: error.status,
            cause: error.cause,
          });
          throw error;
        }
      }
    }
  }

  return messages[messages.length - 1].content;
};

try {
  // await runCase("请查询用户 002 的信息");
  // await runCase("MCP Server 的使用指南是什么");
  // await runCase("北京南站附近的酒店，以及去的路线");
  // await runCase(
  //   "北京南站附近的5个酒店，以及去的路线，路线规划生成文档保存到 /Users/axin/Desktop/knowlege-agent 的一个 md 文件",
  // );
  await runCase(
    "北京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名",
  );
} finally {
  // 关闭 MCP Client，结束进程
  mcpClient.close();
}
