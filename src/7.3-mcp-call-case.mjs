import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import z from "zod";
import { connectMcpServers } from "./7.2-mcp-connect.mjs";

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const jsonSchemaToZod = (schema = {}) => {
  if (schema.type === "object" || schema.properties) {
    const required = new Set(schema.required || []);
    const shape = Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, property]) => {
        let field = jsonSchemaToZod(property);
        if (!required.has(key)) field = field.optional();
        return [key, field];
      }),
    );
    return z.object(shape).passthrough();
  }

  if (schema.enum) return z.enum(schema.enum);
  if (schema.type === "string") return z.string();
  if (schema.type === "number") return z.number();
  if (schema.type === "integer") return z.number().int();
  if (schema.type === "boolean") return z.boolean();
  if (schema.type === "array") return z.array(jsonSchemaToZod(schema.items));
  return z.any();
};

const servers = await connectMcpServers();
const mcpTools = [];

for (const { name, client } of servers) {
  const { tools: definitions } = await client.listTools();

  for (const definition of definitions) {
    mcpTools.push(
      tool(
        async (args) => {
          const result = await client.callTool({
            name: definition.name,
            arguments: args,
          });

          return (
            result.content
              ?.filter((item) => item.type === "text")
              .map((item) => item.text)
              .join("\n") || "MCP 没有返回文本结果"
          );
        },
        {
          name: definition.name,
          description: `${name}: ${definition.description || definition.name}`,
          schema: jsonSchemaToZod(definition.inputSchema),
        },
      ),
    );
  }
}

// 将 MCP tools 提供给模型，由模型自行判断是否需要调用工具。
const modelWithTools = model.bindTools(mcpTools);
const toolMap = new Map(mcpTools.map((mcpTool) => [mcpTool.name, mcpTool]));
const runCase = async () => {
  const messages = [
    new HumanMessage("请查询用户 002 的信息，并告诉我用户姓名。"),
  ];

  for (let i = 0; i < 5; i++) {
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls?.length) {
      console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
      return response.content;
    }

    for (const toolCall of response.tool_calls) {
      const mcpTool = toolMap.get(toolCall.name);
      if (!mcpTool) {
        continue;
      }

      const result = await mcpTool.invoke(toolCall.args);

      messages.push(
        new ToolMessage({
          content: result,
          tool_call_id: toolCall.id,
        }),
      );
    }
  }

  return messages[messages.length - 1].content;
};

try {
  await runCase();
} finally {
  // 关闭 MCP Client，同时结束 stdio Transport 启动的 Server 子进程。
  await Promise.all(servers.map(({ client }) => client.close()));
}
