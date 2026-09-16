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

  const historyMessages = await history.getMessages();
  console.log(`从历史消息记录中加载了 ${historyMessages.length} 条消息:\n`);
  historyMessages.forEach((message, index) => {
    const prefix = message.type === "human" ? "用户" : "助手";
    console.log(`${index + 1}. ${prefix}: ${message.content}`);
  });

  console.log("[第三轮对话]");
  const userMessage3 = new HumanMessage("需要哪些食材");
  await history.addMessage(userMessage3);

  const message3 = [systemMessage, ...(await history.getMessages())];
  const response3 = await model.invoke(message3);
  await history.addMessage(response3);

  console.log(`用户: ${userMessage3.content}`);
  console.log(`助手: ${response3.content}\n`);

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
