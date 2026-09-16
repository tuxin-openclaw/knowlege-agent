import "@knowledge/course-utils/env";
import { MetricType } from "@zilliz/milvus2-sdk-node";
import chalk from "chalk";
import {
  client,
  COLLECTION_NAME,
  connectMilvus,
  getEmbedding,
  loadCollection,
} from "@knowledge/ai-utils";

async function main(query) {
  try {
    await connectMilvus();
    await loadCollection();

    // 向量搜索
    console.log("开始向量搜索：", query);
    const queryVector = await getEmbedding(query);
    const res = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: 2,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "content", "date", "mood", "tags"],
    });
    console.log(`找到 ${res.results.length} 条结果:\n`);
    res.results.forEach((item, index) => {
      console.log(`${index + 1}. [Score: ${item.score.toFixed(4)}]`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Date: ${item.date}`);
      console.log(`   Mood: ${item.mood}`);
      console.log(`   Tags: ${item.tags?.join(", ")}`);
      console.log(`   Content: ${item.content}\n`);
    });
  } catch (error) {
    console.log(chalk.red("Milvus 连接失败"), error);
  }
}

main("我想看看关于户外活动的日记");
