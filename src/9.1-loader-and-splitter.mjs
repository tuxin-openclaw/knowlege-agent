import { config } from "dotenv";
import "cheerio";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OllamaEmbeddings } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

config({ path: new URL("../.env", import.meta.url), override: true });

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const embeddings = new OllamaEmbeddings({
  model: process.env.EMBEDDINGS_MODEL_NAME,
  baseUrl: process.env.EMBEDDINGS_BASE_URL,
});
console.log(`使用 Embedding 模型：${process.env.EMBEDDINGS_MODEL_NAME}`);

const cheerioLoader = new CheerioWebBaseLoader(
  "https://juejin.cn/post/7233327509919547452",
  { selector: ".main-area p" },
);

const documents = await cheerioLoader.load();

// RecursiveCharacterTextSplitter 递归分割，比如“ 。 ？ ！”就是先尝试按照 。 分割，如果分割后大于 chunk 剩余空间再按照 ？ 分割，是一个递归过程。
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500, // 每个分块字符数
  chunkOverlap: 50, // 分块之间重叠字符数，保持语义连贯
  separators: ["。", "！", "？"],
});

const splitDocuments = await textSplitter.splitDocuments(documents);

console.log("正在创建向量存储...");
const vectorStore = await MemoryVectorStore.fromDocuments(
  splitDocuments,
  embeddings,
);
console.log("向量存储创建完成\n");

const retriever = vectorStore.asRetriever({
  k: 2,
});

const questions = ["父亲的去世对作者的人生态度产生了怎样的根本性逆转？"];

for (const question of questions) {
  console.log("=".repeat(80));
  console.log(`问题：${question}`);
  console.log("=".repeat(80));

  const retrievedDocs = await retriever.invoke(question);

  const scoredResults = await vectorStore.similaritySearchWithScore(
    question,
    2,
  );

  console.log("\n【检索到文档及相似度评分");
  retrievedDocs.forEach((doc, index) => {
    const scoredRes = scoredResults.find(
      ([scoredDoc]) => scoredDoc.pageContent === doc.pageContent,
    );
    const score = scoredRes ? scoredRes[1] : null;
    const similarity = score ? score.toFixed(4) : "N/A";

    console.log(`\n[文档 ${index + 1}] 相似度评分：${similarity}`);
    console.log(`内容：${doc.pageContent}`);
    if (doc.metadata) {
      console.log(`元数据：${JSON.stringify(doc.metadata)}`);
    }
  });

  const context = retrievedDocs
    .map((doc, index) => `[片段 ${index + 1}] ${doc.pageContent}`)
    .join("\n\n========\n\n");

  const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：

文章内容：
${context}

问题: ${question}

你的回答:`;

  console.log("\n【AI 回答】");
  const response = await model.invoke(prompt);
  console.log(response.content);
  console.log("\n");
}
