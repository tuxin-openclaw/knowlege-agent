import {
  client,
  loadCollection,
  connectMilvus,
  getEmbedding,
  model,
} from "@knowledge/ai-utils";
import { MetricType } from "@zilliz/milvus2-sdk-node";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

const BOOK_NAME = "非暴力沟通";
const COLLECTION_NAME = "ebook";

/**
 * 从 Milvus 中检索相关内容
 */
const milvusSearch = new RunnableLambda({
  func: async ({ query, limit }) => {
    try {
      const queryVector = await getEmbedding(query);
      const { results = [] } = await client.search({
        collection_name: COLLECTION_NAME,
        vector: queryVector,
        limit,
        metric_type: MetricType.COSINE,
        output_fields: ["id", "book_id", "chapter_num", "index", "content"],
      });

      const retrievedContent = results.map((item) => ({
        id: item.id,
        book_id: item.book_id,
        chapter_num: item.chapter_num,
        index: item.index,
        content: item.content,
        score: item.score,
      }));

      return { query, retrievedContent };
    } catch (error) {
      console.error("检索相关内容错误:", error.message);
      return { query, retrievedContent: [] };
    }
  },
});
const promptTemplate =
  PromptTemplate.fromTemplate(`你是一个专业的《${BOOK_NAME}》读书助手。基于书本内容回答问题，用准确、详细的语言。
请根据以下《${BOOK_NAME}》片段内容回答问题：
{context}

用户问题: {query}

回答要求：
1. 如果片段中有相关信息，请结合书本内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`);

/**
 * 构建 prompt 输入
 */
const buildPromptInput = new RunnableLambda({
  func: async (input) => {
    const { query, retrievedContent } = input;

    if (retrievedContent.length === 0) {
      return {
        hasContext: false,
        query,
        context: "",
        retrievedContent,
      };
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
    return {
      hasContext: true,
      query,
      context,
      retrievedContent,
    };
  },
});

async function answer(query, limit) {
  const chain = RunnableSequence.from([
    milvusSearch,
    buildPromptInput,
    promptTemplate, // 根据 模板生成 prompt，给下一步模型使用
    model,
    new StringOutputParser(),
  ]);

  const stream = await chain.stream({
    query,
    limit,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk);
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
