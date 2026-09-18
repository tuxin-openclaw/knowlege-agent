import { tool } from "@langchain/core/tools";
import z from "zod";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 格式化日志文案
 * @param {*} toolName 工具名称
 * @param {*} description 执行内容
 * @param {*} content 输出内容
 * @returns
 */
const formatMessage = (toolName, description, content) => {
  let msg = `[工具调用] ${toolName} - ${description}`;
  if (content) {
    msg += `：${content}`;
  }
  return msg;
};

const logger = {
  info: (name, description, content) => {
    console.log(formatMessage(name, description, content));
  },
  error: (name, description, content) => {
    console.error(formatMessage(name, description, content));
  },
};

const TOOL_NAME = {
  read: "read_file",
  write: "write_file",
  execute: "execute_command",
  list: "list_directory",
};

const readFileTool = tool(
  async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      logger.info(TOOL_NAME.read, "用来读取文件内容。", filePath);
      return `文件内容：${content}`;
    } catch (error) {
      logger.error(TOOL_NAME.read, "错误", error.message);
      return `读取文件失败：${error.message}`;
    }
  },
  {
    name: TOOL_NAME.read,
    description: "读取指定路径的文件内容",
    schema: z.object({
      filePath: z.string().describe("文件路径"),
    }),
  },
);

const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      logger.info(TOOL_NAME.write, "用来写入文件内容。", filePath);
      return `文件写入成功：${filePath}`;
    } catch (error) {
      logger.error(TOOL_NAME.write, "错误", error.message);
      return `写入文件失败：${error.message}`;
    }
  },
  {
    name: TOOL_NAME.write,
    description: "向指定路径写入文件内容，自动创建目录",
    schema: z.object({
      filePath: z.string().describe("文件路径"),
      content: z.string().describe("文件内容"),
    }),
  },
);

const executeCommandTool = tool(
  async ({ command, dir }) => {
    const cwd = dir || process.cwd();
    logger.info(TOOL_NAME.execute, "工作目录", cwd);

    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(" ");
      const child = spawn(cmd, args, {
        cwd,
        stdio: "inherit",
        shell: true,
      });

      let errMsg = "";

      child.on("error", (err) => {
        errMsg = err.message;
      });

      child.on("close", (code) => {
        if (code === 0) {
          logger.info(TOOL_NAME.execute, "执行成功", command);
          const cwdInfo = dir
            ? `\n\n重要提示：命令在目录 "${cwd}" 中执行成功。如果需要在这个项目目录中继续执行命令，请使用 dir: "${dir}" 参数，不要使用 cd 命令。`
            : "";
          resolve(`命令执行成功：${command}${cwdInfo}`);
          return;
        }
        logger.error(
          TOOL_NAME.execute,
          `${command}执行失败`,
          `退出码：${code}`,
        );
        resolve(
          `命令执行失败，退出码：${code}${errMsg ? `\n错误信息：${errMsg}` : ""}`,
        );
      });
    });
  },
  {
    name: TOOL_NAME.execute,
    description: "执行命令，支持指定工作目录",
    schema: z.object({
      command: z.string().describe("命令"),
      dir: z.string().optional().describe("工作目录"),
    }),
  },
);

const listDirTool = tool(
  async ({ dir }) => {
    try {
      const files = await fs.readdir(dir);
      logger.info(TOOL_NAME.list, `${dir} 目录找到 ${files.length} 个文件`);
      return `目录内容:\n${files.map((f) => `- ${f}`).join("\n")}`;
    } catch (error) {
      logger.error(TOOL_NAME.list, "错误", error.message);
      return `列出目录失败：${error.message}`;
    }
  },
  {
    name: TOOL_NAME.list,
    description: "列出指定目录下的文件和文件夹",
    schema: z.object({
      dir: z.string().describe("目录路径"),
    }),
  },
);

export { readFileTool, writeFileTool, executeCommandTool, listDirTool };
