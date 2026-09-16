import {
  client,
  connectMilvus,
  getEmbedding,
  loadCollection,
  model,
} from "@knowledge/ai-utils";
import { COLLECTION_NAME } from "./constants/index.mjs";
import { MetricType } from "@zilliz/milvus2-sdk-node";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const main = async () => {
  try {
    await connectMilvus();

    await loadCollection();

    // 创建历史消息存储
    const history = new InMemoryChatMessageHistory();

    const conversations = [
      { input: "我之前提到的机器学习项目进展如何？" },
      { input: "我周末经常做什么？" },
      { input: "我的职业是什么？" },
    ];

    for (let i = 0; i < conversations.length; i++) {
      const { input } = conversations[i];

      console.log(`\n[第 ${i + 1} 轮对话]`);
      console.log(`用户: ${input}`);

      console.log("\n【检索相关历史对话】");
      const historyConversations = await getHistoryConversations(input, 2);

      let relevantHistory = "";
      if (historyConversations.length > 0) {
        historyConversations.forEach((conv, idx) => {
          console.log(
            `\n[历史对话 ${idx + 1}] 相似度: ${conv.score.toFixed(4)}`,
          );
          console.log(`轮次: ${conv.round}`);
          console.log(`内容: ${conv.content}`);
        });

        relevantHistory = historyConversations
          .map((conv) => {
            return `[历史对话 ${conv.round}]
轮次: ${conv.round}
内容: ${conv.content}`;
          })
          .join("\n\n========\n\n");

        const contextMessages = relevantHistory
          ? [
              new HumanMessage(
                `相关历史对话：\n${relevantHistory}\n\n用户问题：${input}`,
              ),
            ]
          : [new HumanMessage(input)];

        console.log("\n【AI 回复】");
        const response = await model.invoke(contextMessages);

        await history.addMessage(new HumanMessage(input));
        await history.addMessage(response);

        // 将对话保存到 Milvus 向量数据库
        const conversationText = `用户: ${input}\n助手: ${response.content}`;
        const convId = `conv_${Date.now()}_${i + 1}`;
        const convVector = await getEmbedding(conversationText);

        try {
          await client.insert({
            collection_name: COLLECTION_NAME,
            data: [
              {
                id: convId,
                content: conversationText,
                round: i + 1,
                timestamp: new Date().toISOString(),
                vector: convVector,
              },
            ],
          });
          console.log(`💾 已保存到 Milvus 向量数据库`);
        } catch (error) {
          console.warn("保存到向量数据库时出错:", error.message);
        }

        console.log(`助手: ${response.content}`);
      }
    }
  } catch (error) {
    console.error("错误:", error.message);
  }
};

main();

const getHistoryConversations = async (query, limit) => {
  try {
    const queryVector = await getEmbedding(query);

    const res = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "content", "round", "timestamp"],
    });

    return res.results;
  } catch (error) {
    console.error("检索历史消息错误:", error.message);
    return [];
  }
};

const answer = async (query, limit = 5) => {};
