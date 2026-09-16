import { MetricType } from "@zilliz/milvus2-sdk-node";
import chalk from "chalk";
import {
  client,
  model,
  connectMilvus,
  loadCollection,
  getEmbedding,
  COLLECTION_NAME,
} from "./shared/index.mjs";

/**
 * 从 Milvus 中检索相关日记
 */
async function query(question, limit = 2) {
  try {
    await loadCollection();
    const queryVector = await getEmbedding(question);
    const res = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "content", "date", "mood", "tags"],
    });

    return res.results;
  } catch (error) {
    console.log(chalk.red("Milvus 连接失败"), error);
    return [];
  }
}

/**
 * 使用 RAG 回答关于日记的问题
 */
async function answer(question, limit = 2) {
  try {
    console.log("=".repeat(80));
    console.log(`问题: ${question}`);
    console.log("=".repeat(80));

    console.log("\n【检索相关日记】");
    const diaries = await query(question, limit);

    if (diaries.length === 0) {
      console.log("未找到相关日记");
      return "抱歉，我没有找到相关日记";
    }

    console.log(`找到 ${diaries.length} 条日记:\n`);
    diaries.forEach((diary, index) => {
      console.log(`\n[日记 ${index + 1}] 相似度: ${diary.score.toFixed(4)}`);
      console.log(`日期: ${diary.date}`);
      console.log(`心情: ${diary.mood}`);
      console.log(`标签: ${diary.tags?.join(", ")}`);
      console.log(`内容: ${diary.content}`);
    });

    const context = diaries
      .map(
        (diary, index) => `[日记 ${index + 1}]
日期: ${diary.date}
心情: ${diary.mood}
标签: ${diary.tags?.join(", ")}
内容: ${diary.content}`,
      )
      .join("\n\n========\n\n");

    const prompt = `你是一个温暖贴心的 AI 日记助手。基于用户的日记内容回答问题，用亲切自然的语言。

请根据以下日记内容回答问题：
${context}

用户问题: ${question}

回答要求：
1. 如果日记中有相关信息，请结合日记内容给出详细、温暖的回答
2. 可以总结多篇日记的内容，找出共同点或趋势
3. 如果日记中没有相关信息，请温和地告知用户
4. 用第一人称"你"来称呼日记的作者
5. 回答要有同理心，让用户感到被理解和关心

AI 助手的回答:`;

    console.log("\n【AI 回答】");
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log("\n");

    return response.content;
  } catch (error) {
    console.log(chalk.red("回答问题时出错:"), error.message);
    return "抱歉，处理您的问题时出现了错误。";
  }
}

async function main() {
  try {
    console.log("连接到 Milvus...");
    await connectMilvus();
    console.log("✓ 已连接\n");

    await answer("我最近心情怎么样？", 2);
  } catch (error) {
    console.error("错误:", error.message);
  }
}

main();
