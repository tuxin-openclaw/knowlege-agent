import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";

dotenv.config()

const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const res = await model.invoke("介绍下自己");

console.log(res.content);
