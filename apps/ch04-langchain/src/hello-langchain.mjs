import { ChatOpenAI } from "@langchain/openai";
import "@knowledge/course-utils/env";

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const res = await model.invoke("介绍下自己");

console.log(res.content);
