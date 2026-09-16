import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  client,
  loadCollection,
  connectMilvus,
  getEmbedding,
} from "@knowledge/ai-utils";
import { printSection } from "@knowledge/course-utils/console";
import { DataType, IndexType, MetricType } from "@zilliz/milvus2-sdk-node";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import chalk from "chalk";
import { BOOK_NAME, COLLECTION_NAME } from "./constants/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VECTOR_DIM = 1024;
const EPUB_FILE = path.resolve(__dirname, "./assets/非暴力沟通.epub");
const CHUNK_SIZE = 500;

async function ensureCollection(bookId) {
  try {
    const hasCollection = await client.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (!hasCollection.value) {
      console.log("创建合集...");
      await client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            max_length: 100,
            is_primary_key: true,
          },
          { name: "book_id", data_type: DataType.VarChar, max_length: 100 },
          { name: "book_name", data_type: DataType.VarChar, max_length: 200 },
          { name: "chapter_num", data_type: DataType.Int32 },
          { name: "index", data_type: DataType.Int32 },
          { name: "content", data_type: DataType.VarChar, max_length: 10000 },
          { name: "vector", data_type: DataType.FloatVector, dim: VECTOR_DIM },
        ],
      });
      console.log(chalk.green("合集创建成功\n"));

      // 创建索引
      console.log("创建索引...");
      await client.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: "vector",
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE,
        params: {
          // 将向量空间划分为 1024 个聚类桶，查询时先定位相关桶，再进行相似度搜索
          // 越大，搜索速度越快，但是建立索引时间越长，需要更多的内存，同时因为每次搜索的桶占比更小，可能漏掉相似向量，精度降低
          nlist: 1024,
        },
      });
      console.log(chalk.green("索引创建成功\n"));

      // 加载集合
      await loadCollection();
    }
  } catch (error) {
    console.error("错误:", error.message);
    throw error;
  }
}

async function insertChunksBatch(chunks, bookId, chapterNum) {
  try {
    if (chunks.length === 0) {
      return 0;
    }
    const insertData = await Promise.all(
      chunks.map(async (chunk, chunkIndex) => {
        const vector = await getEmbedding(chunk);
        return {
          id: `${bookId}_${chapterNum}_${chunkIndex}`,
          book_id: bookId,
          book_name: BOOK_NAME,
          chapter_num: chapterNum,
          index: chunkIndex,
          content: chunk,
          vector,
        };
      }),
    );

    const insertRes = await client.insert({
      collection_name: COLLECTION_NAME,
      data: insertData,
    });

    return Number(insertRes.insert_cnt) || 0;
  } catch (error) {
    console.error("插入失败:", error);
    throw error;
  }
}

async function loadAndProcessEPubStreaming(bookId) {
  try {
    const loader = new EPubLoader(EPUB_FILE, { split_chapters: true });

    const docs = await loader.load();
    console.log(`共计 ${docs.length} 个章节`);

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: 50,
    });

    let totalInserted = 0;

    for (let i = 0; i < docs.length; i++) {
      const chapter = docs[i];
      const chapterContent = chapter.pageContent;

      const chunks = await textSplitter.splitText(chapterContent);

      if (chunks.length === 0) {
        console.log(`第 ${i + 1} 章没有内容，跳过`);
        continue;
      }
      console.log(`第 ${i + 1} 章拆分成 ${chunks.length} 个片段`);

      const insertedCount = await insertChunksBatch(chunks, bookId, i + 1);
      totalInserted += insertedCount;

      console.log(
        `✓ 成功插入 ${insertedCount} 条数据（累计 ${totalInserted}）\n`,
      );
    }

    console.log(`✓ 成功插入 ${totalInserted} 条数据\n`);

    return totalInserted;
  } catch (error) {
    console.error("错误:", error.message);
    throw error;
  }
}

async function main() {
  try {
    printSection("电子书处理程序");

    await connectMilvus();

    const bookId = 1;
    await ensureCollection(bookId);
    await loadAndProcessEPubStreaming(bookId);

    printSection("处理完成");
  } catch (error) {
    console.error("错误:", error.message);
  }
}

main();
