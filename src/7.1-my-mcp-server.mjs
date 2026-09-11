import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod";

/**
 * MCP(Model Context Protocal) 模型上下文协议
 * 用来跨进程调用不同的工具（MCP Server）
 * 通过 langchain 的 tool 来调用
 */
const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});

const database = {
  users: {
    "001": { id: "001", name: "张三" },
    "002": { id: "002", name: "李四" },
    "003": { id: "003", name: "王五" },
  },
};

server.registerTool(
  "query_user",
  {
    description: "查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息。",
    inputSchema: z.object({
      userId: z.string().describe("用户 ID"),
    }),
  },
  async ({ userId }) => {
    const user = database.users[userId];

    if (!user) {
      return {
        content: [
          {
            type: "text",
            text: `用户 ${userId} 不存在`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `用户 ${user.id} 的姓名是 ${user.name}`,
        },
      ],
    };
  },
);

/**
 * 注册静态资源，给MCP Client 使用
 */
server.registerResource(
  "使用指南",
  "docs://guide", // MCP Client 通过这个 URI 获取该静态资源
  {
    description: "MCP Server 使用指南",
    mimeType: "text/plain",
  },
  async () => {
    return {
      contents: [
        {
          uri: "docs://guide",
          mimeType: "text/plain",
          text: `MCP Server 使用指南
功能：提供用户查询等工具。
使用：在 Cursor 等 MCP Client 中通过自然语言对话，Cursor 会自动调用相应工具。`,
        },
      ],
    };
  },
);

// 创建通信通道
// StdioServerTransport 标准输入输出进行通信，也可以用其他方式，比如 StreamableHTTPServerTransport（http 通信）
// std 表示 standard，io 表示 in/out
const transport = new StdioServerTransport();
// client 和 server 进行连接
await server.connect(transport);
