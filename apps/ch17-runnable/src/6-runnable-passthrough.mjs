import {
  RunnableLambda,
  RunnableMap,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";

const chainNormal = RunnableSequence.from([
  // 对输入进行处理，转换成对象
  RunnableLambda.from((input) => ({ concept: input })),
  RunnableLambda.from((obj) => {
    return {
      original: obj,
      processed: {
        concept: obj.concept,
        upper: obj.concept.toUpperCase(),
        length: obj.concept.length,
      },
    };
  }),
]);

const chain = RunnableSequence.from([
  // 对输入进行处理，转换成对象
  RunnableLambda.from((input) => ({ concept: input })),
  RunnableMap.from({
    original: new RunnablePassthrough(), // 通过 RunnablePassthrough 拿到上一个 Runnable 的输出
    processed: RunnableLambda.from((obj) => ({
      concept: obj.concept,
      upper: obj.concept.toUpperCase(),
      length: obj.concept.length,
    })),
  }),
]);

// 简化版本，RunnableSequence会自动把函数、对象转换成 Runnable
const chainSimple = RunnableSequence.from([
  (input) => ({ concept: input }),
  {
    original: new RunnablePassthrough(),
    processed: (obj) => ({
      concept: obj.concept,
      upper: obj.concept.toUpperCase(),
      length: obj.concept.length,
    }),
  },
]);

const chainAssign = RunnableSequence.from([
  (input) => ({ concept: input }),
  // 给上一步输出的对象添加属性
  RunnablePassthrough.assign({
    original: new RunnablePassthrough(),
    processed: (obj) => ({
      concept: obj.concept,
      upper: obj.concept.toUpperCase(),
      length: obj.concept.length,
    }),
  }),
]);

const resultNormal = await chainNormal.invoke("神说要有光");
console.log("🚀 ~ resultNormal:", resultNormal);

const result = await chain.invoke("神说要有光");
console.log("🚀 ~ result:", result);

const resultSimple = await chainSimple.invoke("神说要有光");
console.log("🚀 ~ resultSimple:", resultSimple);

const resultAssign = await chainAssign.invoke("神说要有光");
console.log("🚀 ~ resultSimple:", resultAssign);
