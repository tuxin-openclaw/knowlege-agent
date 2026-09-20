import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { model } from "@knowledge/ai-utils";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";

const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    "system",
    "你是一个简洁、有帮助的中文助手，会用 1-2 句话回答用户问题，重点给出明确、有用的信息。",
  ],
  new MessagesPlaceholder("history"),
  ["human", "{input}"],
]);

const simpleChain = promptTemplate.pipe(model).pipe(new StringOutputParser());

const messageHistories = new Map();

const getMessageHistory = (sid) => {
  if (!messageHistories.has(sid)) {
    messageHistories.set(sid, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sid);
};

const chain = new RunnableWithMessageHistory({
  runnable: simpleChain,
  getMessageHistory,
  inputMessagesKey: "input",
  historyMessagesKey: "history",
});

const result1 = await chain.invoke(
  {
    input: "我是一名程序员，来自湛江",
  },
  { configurable: { sessionId: "123" } },
);
console.log("🚀 ~ 问题: 我是一名程序员，来自湛江");
console.log("🚀 ~ 回答: ", result1);

const result2 = await chain.invoke(
  {
    input: "我刚才说我来自哪里？",
  },
  { configurable: { sessionId: "123" } },
);
console.log("🚀 ~ 问题: 我刚才说我来自哪里？");
console.log("🚀 ~ 回答: ", result2);

const result3 = await chain.invoke(
  { input: "我是做什么的？" },
  { configurable: { sessionId: "123" } },
);
console.log("🚀 ~ 问题: 我是做什么的？");
console.log("🚀 ~ 回答: ", result3);
