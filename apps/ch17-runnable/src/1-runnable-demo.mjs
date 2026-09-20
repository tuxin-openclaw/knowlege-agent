import z from "zod";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { model } from "@knowledge/ai-utils";
import { RunnableSequence } from "@langchain/core/runnables";

const schema = z.object({
  translation: z.string().describe("翻译后的英文文本"),
  keywords: z.array(z.string()).describe("3个关键词"),
});

const outputParser = StructuredOutputParser.fromZodSchema(schema);

const promptTemplate = PromptTemplate.fromTemplate(
  "将以下文本翻译成英文，然后总结为3个关键词。\n\n文本：{text}\n\n{format_instructions}",
);

// 1. 普通模式
// const prompt = await promptTemplate.format({
//   text: "你好，世界",
//   format_instructions: outputParser.getFormatInstructions(),
// });

// const response = await model.invoke(prompt);

// const result = await outputParser.parse(response.content);

// 2. Runnable 模式
// const chain = RunnableSequence.from([promptTemplate, model, outputParser]);

// const result = await chain.invoke({
//   text: "你好，世界",
//   format_instructions: outputParser.getFormatInstructions(),
// });

// 3. pipe 模式（底层也是用 RunnableSequence）
const chain = promptTemplate.pipe(model).pipe(outputParser);

const result = await chain.invoke({
  text: "欢迎来到 LangChain，这是一个强大的工具，可以帮助你完成各种任务。",
  format_instructions: outputParser.getFormatInstructions(),
});

console.log("🚀 ~ result:", result);
