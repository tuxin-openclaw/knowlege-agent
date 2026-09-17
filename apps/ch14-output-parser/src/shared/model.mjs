import { model } from "@knowledge/ai-utils";

export const answer = async (prompt) => {
  console.log("问题：", prompt);

  console.log("\n正在调用模型...");
  const response = await model.invoke(prompt);

  console.log("\n回答\n：", response.content);
  return response;
};
