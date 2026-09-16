import { model } from "@knowledge/ai-utils";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FileSystemChatMessageHistory } from "@langchain/community/stores/message/file_system";
import path from "node:path";

const FILE_PATH = path.join(process.cwd(), "chat_history.json");
const SESSION_ID = "my-session-id";

const main = async () => {
  const history = new FileSystemChatMessageHistory({
    filePath: FILE_PATH,
    sessionId: SESSION_ID,
  });

  const systemMessage = new SystemMessage(
    "你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。",
  );

  console.log("[第一轮对话]");
  const userMessage1 = new HumanMessage("你今天吃什么");
  await history.addMessage(userMessage1);

  const message1 = [systemMessage, ...(await history.getMessages())];
  const response1 = await model.invoke(message1);
  await history.addMessage(response1);

  console.log(`用户: ${userMessage1.content}`);
  console.log(`助手: ${response1.content}\n`);

  console.log("[第二轮对话]");
  const userMessage2 = new HumanMessage("好吃吗？");
  await history.addMessage(userMessage2);

  const message2 = [systemMessage, ...(await history.getMessages())];
  const response2 = await model.invoke(message2);
  await history.addMessage(response2);

  console.log(`用户: ${userMessage2.content}`);
  console.log(`助手: ${response2.content}\n`);

  console.log("[历史消息记录]");
  const allMessages = await history.getMessages();
  console.log(`共保存了 ${allMessages.length} 条消息:\n`);
  allMessages.forEach((message, index) => {
    const prefix = message.type === "human" ? "用户" : "助手";
    console.log(
      `[${index + 1}] ${prefix}: ${message.content.substring(0, 50)}...`,
    );
  });
};

main().catch(console.error);
