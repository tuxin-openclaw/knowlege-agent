import {
  connectMilvus,
  client,
  VECTOR_DIM,
  loadCollection,
  getEmbedding,
} from "@knowledge/ai-utils";
import { COLLECTION_NAME } from "./constants/index.mjs";
import { DataType, IndexType, MetricType } from "@zilliz/milvus2-sdk-node";

const main = async () => {
  try {
    await connectMilvus();

    console.log("创建集合...");
    await client.createCollection({
      collection_name: COLLECTION_NAME,
      fields: [
        {
          name: "id",
          data_type: DataType.VarChar,
          max_length: 50,
          is_primary_key: true,
        },
        { name: "vector", data_type: DataType.FloatVector, dim: VECTOR_DIM },
        { name: "content", data_type: DataType.VarChar, max_length: 5000 },
        { name: "round", data_type: DataType.Int64 },
        { name: "timestamp", data_type: DataType.VarChar, max_length: 100 },
      ],
    });
    console.log("✓ 集合创建成功\n");

    console.log("创建索引...");
    await client.createIndex({
      collection_name: COLLECTION_NAME,
      field_name: "vector",
      index_type: IndexType.IVF_FLAT,
      metric_type: MetricType.COSINE,
    });
    console.log("✓ 索引创建成功\n");

    await loadCollection();

    console.log("插入数据...");
    const conversations = [
      {
        id: "conv_001",
        content:
          "用户: 我叫赵六，是一名数据科学家\n助手: 很高兴认识你，赵六！数据科学是一个很有趣的领域。",
        round: 1,
        timestamp: new Date().toISOString(),
      },
      {
        id: "conv_002",
        content:
          "用户: 我最近在研究机器学习算法\n助手: 机器学习确实很有意思，你在研究哪些算法呢？",
        round: 2,
        timestamp: new Date().toISOString(),
      },
      {
        id: "conv_003",
        content:
          "用户: 我喜欢打篮球和看电影\n助手: 运动和文化娱乐都是很好的爱好！",
        round: 3,
        timestamp: new Date().toISOString(),
      },
      {
        id: "conv_004",
        content: "用户: 我周末经常去电影院\n助手: 看电影是很好的放松方式。",
        round: 4,
        timestamp: new Date().toISOString(),
      },
      {
        id: "conv_005",
        content:
          "用户: 我的职业是软件工程师\n助手: 软件工程师是个很有前景的职业！",
        round: 5,
        timestamp: new Date().toISOString(),
      },
    ];

    const conversationData = await Promise.all(
      conversations.map(async (item) => {
        return {
          ...item,
          vector: await getEmbedding(item.content),
        };
      }),
    );

    const insertRes = await client.insert({
      collection_name: COLLECTION_NAME,
      data: conversationData,
    });

    console.log(`✓ 数据插入成功，插入了 ${insertRes.insert_cnt} 条数据);`);

    console.log("=".repeat(60));
    console.log("说明：已成功将对话数据插入到 Milvus 向量数据库");
    console.log("这些对话数据将用于后续的 RAG 检索");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("错误:", error.message);
  }
};

main();
