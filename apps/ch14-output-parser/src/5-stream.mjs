import { model } from "@knowledge/ai-utils";
import z from "zod";
import { StructuredOutputParser } from "@langchain/core/output_parsers";

const prompt = `详细介绍莫扎特的信息。`;

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
  // 1. 普通 stream 模式
  // const stream = await model.stream(prompt);

  // 2. withStructuredOutput
  // stream 模式下，如果用了 withStructuredOutput，会在 json 生成完通过校验后再返回（底层是 tool calls），所以返回最后一个符合结构的数据块，失去了流式效果
  // const structuredModel = model.withStructuredOutput(schema);
  // const stream = await structuredModel.stream(prompt);

  // 3. StructuredOutputParser
  const parser = StructuredOutputParser.fromZodSchema(schema);
  const stream = await model.stream(
    prompt + "\n\n" + parser.getFormatInstructions(),
  );

  console.log("📡 实时输出流式:\n");

  let fullContent = "";
  let chunkCount = 0;

  for await (const chunk of stream) {
    chunkCount++;
    const content = chunk.content;
    fullContent += content;

    // 控制台实时显示流式文本
    process.stdout.write(content);
  }

  console.log(`\n\n✅ 共接收 ${chunkCount} 个数据块\n`);

  const output = await parser.parse(fullContent);
  console.log("✅ 结构化结果:\n", JSON.stringify(output, null, 2));
} catch (error) {
  console.error("❌ 错误:", error.message);
}
