import {
  PipelinePromptTemplate,
  PromptTemplate,
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

// 人设模块
export const personaPrompt = PromptTemplate.fromTemplate(`
你是一名资深工程团队负责人，写作风格：{${PROMPT_VAR.tone}}。
你擅长把枯燥的技术细节写得既专业又有温度。`);

// 背景模块
export const contextPrompt = PromptTemplate.fromTemplate(`
公司: {${PROMPT_VAR.companyName}}
部门: {${PROMPT_VAR.teamName}}
直接汇报对象: {${PROMPT_VAR.managerName}}
本周时间范围: {${PROMPT_VAR.weekRange}}
本周部门核心目标: {${PROMPT_VAR.teamGoal}}`);

// 任务模块
export const taskPrompt = PromptTemplate.fromTemplate(`
以下是本周团队的开发活动(Git/Jira汇总): {${PROMPT_VAR.devActivities}}
请你从这些原始数据中提炼出:
1.本周整体成就亮点
2.潜在风险和技术债
3.下周重点计划建议`);

// 格式模块
export const formatPrompt = PromptTemplate.fromTemplate(`
请用Markdown输出周报,结构包含:
1.本周概览(2-3句话的Summary)
2.详细拆分(按模块或项目分段)
3.关键指标表格,表头为:模块|亮点|风险|下周计划
注意:
-尽量引用一些具体数据(如提交次数、完成的任务编号)
-语气专业,但可以偶尔带一点轻松的口吻,符合{${PROMPT_VAR.companyValues}}`);

export const TEMPLATE_BLOCK = {
  persona: "persona_block",
  context: "context_block",
  task: "task_block",
  format: "format_block",
};
// 最终组合Prompt(把上面几个模块拼在一起)
const finalWeeklyPrompt = PromptTemplate.fromTemplate(`
{${TEMPLATE_BLOCK.persona}}
{${TEMPLATE_BLOCK.context}}
{${TEMPLATE_BLOCK.task}}
{${TEMPLATE_BLOCK.format}}
现在请生成本周的最终周报:`);

export const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: TEMPLATE_BLOCK.persona, prompt: personaPrompt },
    { name: TEMPLATE_BLOCK.context, prompt: contextPrompt },
    { name: TEMPLATE_BLOCK.task, prompt: taskPrompt },
    { name: TEMPLATE_BLOCK.format, prompt: formatPrompt },
  ],
  finalPrompt: finalWeeklyPrompt,
  inputVariables: Object.values(PROMPT_VAR),
});

const pipelineFormatted = await pipelinePrompt.format({
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
  [PROMPT_VAR.companyValues]: "「极致、开放、靠谱」的价值观",
});

console.log(pipelineFormatted);
