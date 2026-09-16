import {
  client,
  loadCollection,
  connectMilvus,
  getEmbedding,
  model,
} from "@knowledge/ai-utils";
import { BOOK_NAME, COLLECTION_NAME } from "./constants/index.mjs";
import { MetricType } from "@zilliz/milvus2-sdk-node";
import { printSection } from "@knowledge/course-utils/console";

async function retrieveRelevantContent(query, limit) {
  try {
    const queryVector = await getEmbedding(query);
    const res = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "book_id", "chapter_num", "index", "content"],
    });

    return res.results;
  } catch (error) {
    console.error("检索相关内容错误:", error.message);
    return [];
  }
}

async function answer(query, limit) {
  try {
    printSection(`问题：${query}`);

    console.log("\n【检索相关内容】");
    const retrievedContent = await retrieveRelevantContent(query, limit);

    if (retrievedContent.length === 0) {
      console.log("未找到相关内容");
      return "抱歉，我没有找到相关内容";
    }

    retrievedContent.forEach((item, i) => {
      console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`);
      console.log(`书籍: ${item.book_id}`);
      console.log(`章节: 第 ${item.chapter_num} 章`);
      console.log(`片段索引: ${item.index}`);
      console.log(
        `内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? "..." : ""}`,
      );
    });

    const context = retrievedContent
      .map((item, i) => {
        return `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`;
      })
      .join("\n\n━━━━━\n\n");

    const prompt = `你是一个专业的《${BOOK_NAME}》读书助手。基于书本内容回答问题，用准确、详细的语言。
请根据以下《${BOOK_NAME}》片段内容回答问题：
${context}

用户问题: ${query}

回答要求：
1. 如果片段中有相关信息，请结合书本内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`;

    console.log("\n【AI 回答】");
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log("\n");

    return response.content;
  } catch (error) {
    console.error("回答问题时出错:", error.message);
    return "抱歉，我无法回答你的问题";
  }
}

async function main(query) {
  try {
    await connectMilvus();

    await loadCollection();

    await answer(query, 5);
  } catch (error) {
    console.error("错误:", error.message);
  }
}

main("当我感到不舒服但不知道怎么表达时，如何用非暴力沟通把它说出来？");
