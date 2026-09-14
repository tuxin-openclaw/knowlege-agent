import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFile } from "node:fs/promises";

const MCP_CONFIG_PATH = new URL("../.vscode/mcp.json", import.meta.url);

const readMcpConfig = async () => {
  const content = await readFile(MCP_CONFIG_PATH, "utf-8");
  return JSON.parse(content);
};

const createMcpTransport = (config) => {
  if (config.command) {
    return new StdioClientTransport(config);
  }

  if (config.url) {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: {
        headers: config.headers,
      },
    });
  }

  throw new Error("MCP 配置必须包含 command 或 url");
};

/**
 * 读取标准 MCP 配置，并连接全部 MCP Server。
 */
export const connectMcpServers = async () => {
  const config = await readMcpConfig();
  const servers = [];

  for (const [name, serverConfig] of Object.entries(config.mcpServers || {})) {
    const client = new Client({
      name: "mini-cursor",
      version: "1.0.0",
    });
    const transport = createMcpTransport(serverConfig);

    await client.connect(transport);
    servers.push({ name, client });
  }

  return servers;
};
