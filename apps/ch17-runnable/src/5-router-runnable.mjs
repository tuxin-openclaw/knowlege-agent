import { RouterRunnable, RunnableLambda } from "@langchain/core/runnables";

const addOne = RunnableLambda.from((input) => input + 1);

const multiplyTwo = RunnableLambda.from((input) => input * 2);

const square = RunnableLambda.from((input) => input * input);

const router = new RouterRunnable({
  runnables: {
    addOne,
    multiplyTwo,
    square,
  },
});

const testCases = [
  { key: "addOne", input: 5 },
  { key: "multiplyTwo", input: 5 },
  { key: "square", input: 5 },
];

for (const { key, input } of testCases) {
  const result = await router.invoke({ key, input });
  console.log(`Input: ${input}, Output: ${result}`);
}
