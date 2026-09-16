import { client, COLLECTION_NAME } from "@knowledge/ai-utils";

async function remove(id) {
  client.delete({
    collection_name: COLLECTION_NAME,
    filter: `id = '${id}'`,
  });
}

async function main() {
  try {
    console.log("连接到 Milvus...");
    await client.connectPromise;
    console.log("✓ 已连接\n");

    console.log("正在删除日记...");
    await remove("diary_001");
    console.log("✓ 已删除日记, ID: diary_001\n");
  } catch (error) {
    console.error("错误:", error.message);
  }
}

main();
