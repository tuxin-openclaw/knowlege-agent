import { answer } from "./shared/model.mjs";
import {
  JsonOutputParser,
  StructuredOutputParser,
} from "@langchain/core/output_parsers";

// const parser = new JsonOutputParser();
const parser = StructuredOutputParser.fromNamesAndDescriptions({
  name: "姓名",
  birth_year: "出生年份",
  nationality: "国籍",
  major_achievements: "主要成就",
  famous_theory: "著名理论",
});

(async () => {
  try {
    // const res = await answer(
    //   `请介绍一下爱因斯坦的信息。请以 JSON 格式返回，包含以下字段：name（姓名）、birth_year（出生年份）、nationality（国籍）、major_achievements（主要成就，数组）、famous_theory（著名理论）。`,
    // );
    const res = await answer(
      `请介绍一下爱因斯坦的信息。
      ${parser.getFormatInstructions()}`,
    );

    const result = await parser.parse(res.content);

    console.log("✅ JsonOutputParser 自动解析的结果:\n");
    console.log(`姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`著名理论: ${result.famous_theory}`);
    console.log(`主要成就:`, result.major_achievements);
  } catch (error) {
    console.error("错误:", error.message);
  }
})();
