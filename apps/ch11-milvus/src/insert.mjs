import "@knowledge/course-utils/env";
import { DataType, IndexType, MetricType } from "@zilliz/milvus2-sdk-node";
import chalk from "chalk";
import {
  client,
  COLLECTION_NAME,
  connectMilvus,
  getEmbedding,
  VECTOR_DIM,
} from "@knowledge/ai-utils";

async function main() {
  try {
    await connectMilvus();

    // 1. 创建合集
    console.log("创建合集...");
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
        { name: "date", data_type: DataType.VarChar, max_length: 50 },
        { name: "mood", data_type: DataType.VarChar, max_length: 50 },
        {
          name: "tags",
          data_type: DataType.Array,
          element_type: DataType.VarChar,
          max_capacity: 10,
          max_length: 50,
        },
      ],
    });
    console.log(chalk.green("合集创建成功\n"));

    // 2. 创建索引，快速查询
    console.log("创建索引...");
    await client.createIndex({
      collection_name: COLLECTION_NAME,
      field_name: "vector",
      // 索引类型为 FloatVector
      index_type: IndexType.IVF_FLAT,
      // 指定用余弦相似度作为距离度量
      metric_type: MetricType.COSINE,
      params: {
        nlist: 1024,
      },
    });
    console.log(chalk.green("索引创建成功\n"));

    // 4. 转换向量，插入数据
    console.log("插入数据...");
    const diaryContents = [
      {
        id: "diary_001",
        content:
          "今天天气很好，去公园散步了，心情愉快。看到了很多花开了，春天真美好。",
        date: "2026-01-10",
        mood: "happy",
        tags: ["生活", "散步"],
      },
      {
        id: "diary_002",
        content:
          "今天工作很忙，完成了一个重要的项目里程碑。团队合作很愉快，感觉很有成就感。",
        date: "2026-01-11",
        mood: "excited",
        tags: ["工作", "成就"],
      },
      {
        id: "diary_003",
        content:
          "周末和朋友去爬山，天气很好，心情也很放松。享受大自然的感觉真好。",
        date: "2026-01-12",
        mood: "relaxed",
        tags: ["户外", "朋友"],
      },
      {
        id: "diary_004",
        content:
          "今天学习了 Milvus 向量数据库，感觉很有意思。向量搜索技术真的很强大。",
        date: "2026-01-12",
        mood: "curious",
        tags: ["学习", "技术"],
      },
      {
        id: "diary_005",
        content:
          "晚上做了一顿丰盛的晚餐，尝试了新菜谱。家人都说很好吃，很有成就感。",
        date: "2026-01-13",
        mood: "proud",
        tags: ["美食", "家庭"],
      },
    ];
    console.log("正在获取向量...");
    const diaryData = await Promise.all(
      diaryContents.map(async (diary) => ({
        ...diary,
        vector: await getEmbedding(diary.content),
      })),
    );

    const insertRes = await client.insert({
      collection_name: COLLECTION_NAME,
      data: diaryData,
    });
    console.log(chalk.green("成功插入数据\n"), insertRes.insert_cnt);
  } catch (error) {
    console.log(chalk.red("Milvus 连接失败"), error);
  }
}

main();
