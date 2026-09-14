import { readFile } from "node:fs/promises";
/**
 * 读取 MCP 配置文件
 */
export const readMcpConfig = async () => {
  const MCP_CONFIG_PATH = new URL("../../.vscode/mcp.json", import.meta.url);
  const content = await readFile(MCP_CONFIG_PATH, "utf-8");
  return JSON.parse(content);
};
