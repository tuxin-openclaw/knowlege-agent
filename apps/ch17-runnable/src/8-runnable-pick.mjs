import {
  RunnableEach,
  RunnableLambda,
  RunnablePick,
  RunnableSequence,
} from "@langchain/core/runnables";

const inputData = {
  name: "Alice",
  age: 25,
  city: "New York",
  country: "USA",
};

const chain = RunnableSequence.from([
  (input) => ({
    ...input,
    fullInfo: `Name: ${input.name}, Age: ${input.age}, City: ${input.city}, Country: ${input.country}`,
  }),
  new RunnablePick(["name", "fullInfo"]),
]);

const result = await chain.invoke(inputData);
console.log("🚀 ~ result:", result);
