/**
 * 把普通函数封装成 Runnable 对象
 */

import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

const addOne = RunnableLambda.from((input) => {
  console.log("addOne:", input);
  return input + 1;
});

const multiplyTwo = RunnableLambda.from((input) => {
  console.log("multiplyTwo:", input);
  return input * 2;
});

const chain = RunnableSequence.from([addOne, multiplyTwo, addOne]);

const result = await chain.invoke(5);

console.log("🚀 ~ result:", result);
