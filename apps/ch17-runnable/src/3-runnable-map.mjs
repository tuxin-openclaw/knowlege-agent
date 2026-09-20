/**
 * 并行执行多个 Runnable
 */
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableMap } from "@langchain/core/runnables";

const addOne = RunnableLambda.from((input) => {
  console.log("addOne:", input.num);
  return input.num + 1;
});

const multiplyTwo = RunnableLambda.from((input) => {
  console.log("multiplyTwo:", input.num);
  return input.num * 2;
});

const square = RunnableLambda.from((input) => {
  console.log("square:", input.num);
  return input.num * input.num;
});

const greetTemplate = PromptTemplate.fromTemplate("你好, {name}!");
const weatherTemplate = PromptTemplate.fromTemplate("今天天气 {weather}");

const runnableMap = RunnableMap.from({
  add: addOne,
  multiply: multiplyTwo,
  square,

  greeting: greetTemplate,
  weather: weatherTemplate,
});

const result = await runnableMap.invoke({
  name: "小明",
  weather: "晴天",
  num: 5,
});

console.log("🚀 ~ result:", result);
