import z from "zod";
import { model } from "@knowledge/ai-utils";

const scientistSchema = z.object({
  name: z.string().describe("科学家的全名"),
  birth_year: z.number().describe("出生年份"),
  nationality: z.string().describe("国籍"),
  fields: z.array(z.string()).describe("研究领域列表"),
});

const modelWithTool = model.bindTools([
  {
    name: "extract_scientist_info",
    description: "从文本中提取科学家信息",
    schema: scientistSchema,
  },
]);

const response = await modelWithTool.invoke("介绍一下爱因斯坦");

console.log("response.tool_calls:", response.tool_calls);
// 获取结构化结果
const result = response.tool_calls[0].args;

console.log("结构化结果:", JSON.stringify(result, null, 2));
console.log(`\n姓名: ${result.name}`);
console.log(`出生年份: ${result.birth_year}`);
console.log(`国籍: ${result.nationality}`);
console.log(`研究领域: ${result.fields.join(", ")}`);
