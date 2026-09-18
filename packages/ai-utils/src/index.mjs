import "@knowledge/course-utils/env";
import { OllamaEmbeddings } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import chalk from "chalk";

export const COLLECTION_NAME = "ai_diary";
export const VECTOR_DIM = 1024;

export const embeddings = new OllamaEmbeddings({
  model: process.env.EMBEDDINGS_MODEL_NAME,
  baseUrl: process.env.EMBEDDINGS_BASE_URL,
  dimensions: VECTOR_DIM,
});

export const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

export const MILVUS_ADDRESS = "localhost:19530";

export const client = new MilvusClient({
  address: MILVUS_ADDRESS,
});

export function getEmbedding(text) {
  return embeddings.embedQuery(text);
}

export async function connectMilvus() {
  console.log("Milvus 连接中...");
  const res = await client.connectPromise;
  console.log(chalk.green("Milvus 连接成功\n"));
  return res;
}

export async function loadCollection() {
  console.log("\n加载合集...");
  const res = await client.loadCollection({ collection_name: COLLECTION_NAME });
  console.log(chalk.green("合集加载成功\n"));
  return res;
}
