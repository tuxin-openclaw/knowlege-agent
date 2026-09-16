import { model } from "@knowledge/ai-utils";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import {
  AIMessage,
  getBufferString,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { getEncoding, getEncodingNameForModel } from "js-tiktoken";

const main = async () => {
  try {
    const history = new InMemoryChatMessageHistory();
    const maxTokens = 200;
    const keepRecentTokens = 80;

    const messages = [
      { type: "human", content: "我想学做红烧肉，你能教我吗？" },
      {
        type: "ai",
        content:
          "当然可以！红烧肉是一道经典的中式菜肴。首先需要准备五花肉、冰糖、生抽、老抽、料酒等材料。",
      },
      { type: "human", content: "五花肉需要切多大块？" },
      {
        type: "ai",
        content:
          "建议切成3-4厘米见方的块，这样既容易入味，口感也更好。切好后可以用开水焯一下去除血沫。",
      },
      { type: "human", content: "炒糖色的时候有什么技巧吗？" },
      {
        type: "ai",
        content:
          "炒糖色是关键步骤。用小火慢慢炒，等冰糖完全融化变成焦糖色，冒小泡时就可以下肉了。注意不要炒过头，否则会发苦。",
      },
      { type: "human", content: "需要炖多长时间？" },
      {
        type: "ai",
        content:
          "一般需要炖40-60分钟，用小火慢炖，直到肉变得软糯入味。可以用筷子戳一下，能轻松戳透就说明好了。",
      },
      { type: "human", content: "最后收汁的时候要注意什么？" },
      {
        type: "ai",
        content:
          "收汁时要用大火，不断翻动，让汤汁均匀包裹在肉块上。看到汤汁变得浓稠，颜色红亮就可以出锅了。",
      },
    ];

    for (const msg of messages) {
      if (msg.type === "human") {
        await history.addMessage(new HumanMessage(msg.content));
      } else {
        await history.addMessage(new AIMessage(msg.content));
      }
    }

    let allMessages = await history.getMessages();

    const enc = getEncoding(getEncodingNameForModel("gpt-4"));
    const allTokens = countTokens(allMessages, enc);

    if (allTokens > maxTokens) {
      const recentMessages = [];
      let recentTokens = 0;

      for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        const msgTokens = enc.encode(content).length;

        if (recentTokens + msgTokens <= keepRecentTokens) {
          recentMessages.unshift(msg);
          recentTokens += msgTokens;
        } else {
          break;
        }
      }

      const messagesToSummarize = allMessages.slice(
        0,
        allMessages.length - recentMessages.length,
      );
      const summarizeTokens = countTokens(messagesToSummarize, enc);

      console.log("\n💡 Token 数量超过阈值，开始总结...");
      console.log(
        `📝 将被总结的消息数量: ${messagesToSummarize.length} (${summarizeTokens} tokens)`,
      );
      console.log(
        `📝 将被保留的消息数量: ${recentMessages.length} (${recentTokens} tokens)`,
      );

      const summary = await summarizeHistory(messagesToSummarize);

      await history.clear();
      for (const msg of recentMessages) {
        await history.addMessage(msg);
      }

      console.log(`\n保留消息数量: ${recentMessages.length}`);
      console.log(
        "保留的消息:",
        recentMessages
          .map((m) => {
            const content =
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content);
            const tokens = enc.encode(content).length;
            return `${m.constructor.name} (${tokens} tokens): ${m.content}`;
          })
          .join("\n  "),
      );
      console.log(`\n总结内容（不包含保留的消息）: ${summary}`);
    } else {
      console.log(
        `\nToken 数量 (${allTokens}) 未超过阈值 (${maxTokens})，无需总结`,
      );
    }
  } catch (err) {
    console.log("错误:", err);
  }
};

const countTokens = (msgs, encoder) => {
  let total = 0;
  for (const msg of msgs) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    total += encoder.encode(content).length;
  }
  return total;
};

const summarizeHistory = async (msgs) => {
  if (msgs.length === 0) return "";

  // 从消息中提取文本
  const conversationText = getBufferString(msgs, "用户", "助手");

  const summaryPrompt = `请总结一下对话的核心内容，保留重要信息：
  
  ${conversationText}
  
  总结：`;

  const summaryRes = await model.invoke([new SystemMessage(summaryPrompt)]);
  return summaryRes.content;
};

main();
