import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import fs from "node:fs/promises";
import { z } from "zod";
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0, // 温度越低，输出越确定，让模型严格遵守指令不要自己发挥
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const readFileTool = tool(
  async ({ filePath }) => {
    const content = await fs.readFile(filePath, "utf-8");
    console.log("[读取文件]", filePath);
    return content;
  },
  {
    name: "read_file",
    description: "用来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。",
    /**
     * 用zod转成 JSON Schema
     * {
     *  type: "object",
     *  properties: {
     *    filePath: { type: "string" }
     *  },
     *  required: ["filePath"]
     * }
     */
    schema: z.object({
      filePath: z.string().describe("要读取的文件路径")
    })
  }
)

const tools = [
  readFileTool
]

const modelWithTools = model.bindTools(tools)

const msgs = [
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

工作流程：
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释

可用工具：
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),
  new HumanMessage('读取文件 src/5.1-tool-file-read.mjs 文件内容并解释代码')
]

let resp = await modelWithTools.invoke(msgs);

msgs.push(resp)

while (resp.tool_calls?.length) {
  console.log(`\n【${resp.tool_calls?.length}个工具调用】`);

  const toolCallsPromise = resp.tool_calls.map(async toolCall => {
    const tool = tools.find(tool => tool.name === toolCall.name);
    if(!tool) {
      return `[错误] 找不到工具 ${toolCall.name}`
    }

    console.log(`\n[执行工具] ${tool.name}(${JSON.stringify(toolCall.args)})`);
    try {
      const res = await tool.invoke(toolCall.args);
      return res
    } catch (error) {
      return `[错误] ${error.message}`
    }
  })

  const toolResults = await Promise.all(toolCallsPromise);
  
  // 将工具结果添加到消息列表
  resp.tool_calls.forEach((toolCall, index) => {
    msgs.push(new ToolMessage({
      content: toolResults[index],
      tool_call_id: toolCall.id
    }));
  })

  // 再次调用模型，传入工具结果
  resp = await modelWithTools.invoke(msgs)
  msgs.push(resp)
}

console.log(`\n[最终结果]\n ${resp.content}`);