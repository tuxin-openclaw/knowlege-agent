import { model } from "@knowledge/ai-utils";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";
import z from "zod";

const prompt = `用中文详细介绍莫扎特的信息。`;

try {
  const schema = z.object({
    name: z.string().describe("姓名"),
    birth_year: z.number().describe("出生年份"),
    death_year: z.number().describe("去世年份"),
    nationality: z.string().describe("国籍"),
    occupation: z.string().describe("职业"),
    famous_works: z.array(z.string()).describe("著名作品列表"),
    biography: z.string().describe("简短传记"),
  });

  const modelWithTool = model.bindTools([
    {
      name: "extract_scientist_info",
      description: "从文本中提取科学家信息",
      schema,
    },
  ]);

  // 流式接收json
  const parser = new JsonOutputToolsParser();
  const chain = modelWithTool.pipe(parser);

  const stream = await chain.stream(prompt);

  console.log("📡 实时输出流式 tool_calls_chunk:\n");

  let chunkCount = 0;

  for await (const chunk of stream) {
    chunkCount++;
    // 直接打印每个 chunk 的 tool_calls 信息
    if (chunk?.length) {
      console.log("🚀 ~ chunk:", chunk[0]?.args);
    }
  }

  console.log(`\n\n✅ 共接收 ${chunkCount} 个数据块\n`);
} catch (error) {
  console.error("❌ 错误:", error.message);
}
