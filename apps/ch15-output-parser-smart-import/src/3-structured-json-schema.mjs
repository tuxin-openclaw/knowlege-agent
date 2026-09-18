import "@knowledge/course-utils/env";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import z from "zod";
import { ChatOpenAI } from "@langchain/openai";
import chalk from "chalk";

const scientistSchema = z
  .object({
    name: z.string().describe("科学家的全名"),
    birth_year: z.number().describe("出生年份"),
    field: z.string().describe("主要研究领域"),
    achievements: z.array(z.string()).describe("主要成就列表"),
  })
  .strict();

const nativeJsonSchema = scientistSchema.toJSONSchema();

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  modelKwargs: {
    // 通过 modelKwargs 传入原生 json_schema 参数
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scientist_info",
        strict: true,
        schema: nativeJsonSchema,
      },
    },
  },
});

const res = await model.invoke([
  new SystemMessage("你是一个信息提取助手，请直接返回 JSON 数据。"),
  new HumanMessage("介绍一下杨振宁"),
]);
console.log(chalk.green("\n✅ 收到响应 (纯净 JSON):"));
console.log(res.content);

const data = JSON.parse(res.content);
console.log(chalk.cyan("\n📋 解析后的对象:"));
console.log(data);
