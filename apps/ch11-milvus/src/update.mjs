import {
  client,
  COLLECTION_NAME,
  connectMilvus,
  getEmbedding,
} from "@knowledge/ai-utils";
import chalk from "chalk";

async function main() {
  try {
    await connectMilvus();

    const updateData = {
      id: "diary_001",
      content:
        "今天下了一整天的雨，心情很糟糕。工作上遇到了很多困难，感觉压力很大。一个人在家，感觉特别孤独。",
      date: "2026-01-10",
      mood: "sad",
      tags: ["生活", "散步", "朋友"],
    };

    console.log("正在生成向量...");
    updateData.vector = await getEmbedding(updateData.content);

    console.log("正在更新日记...");
    const result = await client.upsert({
      collection_name: COLLECTION_NAME,
      data: [updateData],
    });

    if (result.status.error_code !== "Success") {
      throw new Error(result.status.reason || "Milvus upsert 失败");
    }

    console.log(`✓ 已更新日记 ID: ${updateData.id}`);
    console.log(`  New content: ${updateData.content}`);
    console.log(`  New mood: ${updateData.mood}`);
    console.log(`  New tags: ${updateData.tags.join(", ")}`);
    console.log(`  Upsert count: ${result.upsert_cnt}\n`);
  } catch (error) {
    console.log(chalk.red("Milvus 更新失败: ", error.message));
  }
}

main();
