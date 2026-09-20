import { RunnableBranch, RunnableLambda } from "@langchain/core/runnables";

const isPositive = RunnableLambda.from((input) => input > 0);
const isNegative = RunnableLambda.from((input) => input < 0);
const isEven = RunnableLambda.from((input) => input % 2 === 0);

const handlePositive = RunnableLambda.from(
  (input) => `Positive: ${input} + 10 = ${input + 10}`,
);
const handleNegative = RunnableLambda.from(
  (input) => `Negative: ${input} - 10 = ${input - 10}`,
);
const handleEven = RunnableLambda.from(
  (input) => `Even: ${input} * 2 = ${input * 2}`,
);
const handleDefault = RunnableLambda.from((input) => `Default: ${input}`);

const runnableBranch = RunnableBranch.from([
  [isPositive, handlePositive],
  [isNegative, handleNegative],
  [isEven, handleEven],
  handleDefault,
]);

const testCases = [5, -3, 4, 0];

for (const num of testCases) {
  const result = await runnableBranch.invoke(num);
  console.log(`Input: ${num}, Output: ${result}`);
}
