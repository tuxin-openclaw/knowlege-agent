import {
  client,
  loadCollection,
  connectMilvus,
  getEmbedding,
} from "@knowledge/ai-utils";
import { COLLECTION_NAME } from "./constants/index.mjs";
import { MetricType } from "@zilliz/milvus2-sdk-node";

async function main(query) {
  try {
    await connectMilvus();

    await loadCollection();

    console.log(`问题：${query}\n`);

    const queryVector = await getEmbedding(query);
    const res = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: 2,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "book_id", "chapter_num", "index", "content"],
    });
    console.log(`找到 ${res.results.length} 条数据:\n`);
    res.results.forEach((item, index) => {
      console.log(`${index + 1}. [得分: ${item.score.toFixed(4)}]`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Book ID: ${item.book_id}`);
      console.log(`   Chapter: 第 ${item.chapter_num} 章`);
      console.log(`   Index: ${item.index}`);
      console.log(`   Content: ${item.content}\n`);
    });
  } catch (error) {
    console.error("错误:", error.message);
  }
}

main("当我感到不舒服但不知道怎么表达时，如何用非暴力沟通把它说出来？");
