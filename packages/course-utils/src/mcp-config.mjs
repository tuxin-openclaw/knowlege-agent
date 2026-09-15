import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const mcpConfigUrl = new URL("../../../.vscode/mcp.json", import.meta.url);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
/**
 * 读取项目级 MCP 配置，并让其中相对路径始终以仓库根目录为基准。
 */
export const readMcpConfig = async () => {
  const content = await readFile(mcpConfigUrl, "utf-8");
  const config = JSON.parse(content);

  return {
    ...config,
    mcpServers: Object.fromEntries(
      Object.entries(config.mcpServers ?? {}).map(([name, server]) => [
        name,
        server.command
          ? { ...server, cwd: server.cwd ?? workspaceRoot }
          : server,
      ]),
    ),
  };
};
