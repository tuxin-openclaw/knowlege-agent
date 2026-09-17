import { model } from "@knowledge/ai-utils";
import z from "zod";

const scientistSchema = z.object({
  name: z.string().describe("科学家的全名"),
  birth_year: z.number().describe("出生年份"),
  nationality: z.string().describe("国籍"),
  fields: z.array(z.string()).describe("研究领域列表"),
});

// 注意：不同模型或 Provider 对 JSON Schema 的支持不同。
// 不支持时，withStructuredOutput 请求可能会失败或长时间等待。
const structuredModel = model.withStructuredOutput(scientistSchema);

const result = await structuredModel.invoke("介绍一下爱因斯坦");

console.log("结构化结果:", JSON.stringify(result, null, 2));
console.log(`\n姓名: ${result.name}`);
console.log(`出生年份: ${result.birth_year}`);
console.log(`国籍: ${result.nationality}`);
console.log(`研究领域: ${result.fields.join(", ")}`);
