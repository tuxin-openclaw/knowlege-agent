import {
  RunnableEach,
  RunnableLambda,
  RunnableSequence,
} from "@langchain/core/runnables";

const addOne = RunnableLambda.from((input) => input + 1);

const multiplyTwo = RunnableLambda.from((input) => input * 2);

const square = RunnableLambda.from((input) => input * input);

const processItem = RunnableSequence.from([addOne, multiplyTwo, square]);

const chain = new RunnableEach({
  bound: processItem,
});

const input = [1, 2, 3];

const result = await chain.invoke(input);
console.log("🚀 ~ input:", input);
console.log("🚀 ~ result:", result);
