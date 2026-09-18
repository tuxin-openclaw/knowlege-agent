import { model } from "@knowledge/ai-utils";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from "@langchain/core/prompts";

export const PROMPT_VAR = Object.freeze({
  tone: "tone",
  companyName: "company_name",
  teamName: "team_name",
  managerName: "manager_name",
  weekRange: "week_range",
  teamGoal: "team_goal",
  devActivities: "dev_activities",
  companyValues: "company_values",
});

// const systemTemplate = [
//   "system",
//   `你是一名资深工程团队负责人，写作风格：{${PROMPT_VAR.tone}}。请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。`,
// ];
const systemTemplate = SystemMessagePromptTemplate.fromTemplate(
  `你是一名资深工程团队负责人，写作风格：{${PROMPT_VAR.tone}}。请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。`,
);

// const humanTemplate = [
//   "human",
//   `本周信息如下：
// 公司: {${PROMPT_VAR.companyName}}
// 部门: {${PROMPT_VAR.teamName}}
// 直接汇报对象: {${PROMPT_VAR.managerName}}
// 本周时间范围: {${PROMPT_VAR.weekRange}}
// 本周部门核心目标: {${PROMPT_VAR.teamGoal}}

// 以下是本周团队的开发活动(Git/Jira汇总): {${PROMPT_VAR.devActivities}}
// 请你从这些原始数据中提炼出:
// 1.本周整体成就亮点
// 2.潜在风险和技术债
// 3.下周重点计划建议`,
// ];
const humanTemplate = HumanMessagePromptTemplate.fromTemplate(`本周信息如下：
公司: {${PROMPT_VAR.companyName}}
部门: {${PROMPT_VAR.teamName}}
直接汇报对象: {${PROMPT_VAR.managerName}}
本周时间范围: {${PROMPT_VAR.weekRange}}
本周部门核心目标: {${PROMPT_VAR.teamGoal}}

以下是本周团队的开发活动(Git/Jira汇总): {${PROMPT_VAR.devActivities}}
请你从这些原始数据中提炼出:
1.本周整体成就亮点
2.潜在风险和技术债
3.下周重点计划建议`);

export const chatPrompt = ChatPromptTemplate.fromMessages([
  systemTemplate,
  humanTemplate,
]);

const chatMessages = await chatPrompt.formatMessages({
  [PROMPT_VAR.tone]: "专业、清晰、略带幽默",
  [PROMPT_VAR.companyName]: "星航科技",
  [PROMPT_VAR.teamName]: "AI 平台组",
  [PROMPT_VAR.managerName]: "王总",
  [PROMPT_VAR.weekRange]: "2025-02-03 ~ 2025-02-09",
  [PROMPT_VAR.teamGoal]:
    "完成智能周报 Agent 的 MVP 版本，并打通 Git / Jira 数据源。",
  [PROMPT_VAR.devActivities]: `- Git: 58 次提交，3 个主要分支合并
  - Jira: 完成 12 个 Story，关闭 7 个 Bug
  - 关键任务：完成智能周报 Pipeline 设计、实现 Prompt 拆分、接入 ExampleSelector`,
});

console.log(chatMessages);

const stream = await model.stream(chatMessages);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
