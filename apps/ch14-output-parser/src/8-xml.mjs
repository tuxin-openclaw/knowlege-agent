import { model } from "@knowledge/ai-utils";
import { XMLOutputParser } from "@langchain/core/output_parsers";

const parser = new XMLOutputParser();

const prompt = `请提取以下文本中的人物信息：阿尔伯特·爱因斯坦出生于 1879 年，是一位伟大的物理学家。

${parser.getFormatInstructions()}`;

try {
  const response = await model.invoke(prompt);

  console.log("📤 模型原始响应:\n");
  console.log(response.content);

  const result = await parser.parse(response.content);

  console.log("✅ XMLOutputParser 自动解析的结果:\n");
  console.log(result);
} catch (error) {
  console.error("错误:", error.message);
}
