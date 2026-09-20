import { pipelinePrompt, PROMPT_VAR } from "./2-pipeline-prompt-template.mjs";

const pipelineWithPartial = await pipelinePrompt.partial({
  [PROMPT_VAR.companyName]: "星航科技",
  [PROMPT_VAR.companyValues]: "极致、开放、靠谱的价值观",
  [PROMPT_VAR.tone]: "偏正式但不僵硬",
});

const partialFormatted = await pipelineWithPartial.format({
  [PROMPT_VAR.teamName]: "AI平台组",
  [PROMPT_VAR.managerName]: "刘东",
  [PROMPT_VAR.weekRange]: "2025-02-10 ~ 2025-02-16",
  [PROMPT_VAR.teamGoal]: "上线周报Agent到内部试用环境,并收集反馈。",
  [PROMPT_VAR.devActivities]:
    "- 小明: 完成 Git/Jira集成封装\n" +
    "- 小红: 实现Prompt配置化加载\n" +
    "- 小强: 接入权限系统,支持按部门过滤数据",
});

const partialFormatted2 = await pipelineWithPartial.format({
  [PROMPT_VAR.teamName]: "AI 工程效率组",
  [PROMPT_VAR.managerName]: "王强",
  [PROMPT_VAR.weekRange]: "2025-02-17 ~ 2025-02-23",
  [PROMPT_VAR.teamGoal]: "打通 CI/CD 可观测链路，并推动落地到核心服务。",
  [PROMPT_VAR.devActivities]:
    "- 打通 CI/CD 可观测链路，并推动落地到核心服务。\n" +
    "- 小白：梳理核心服务发布流程，补齐变更记录\n" +
    "- 小七：研发发布回滚一键脚本 PoC 版本",
});

console.log(partialFormatted);
console.log("\n================ 分割线：第二份周报模板 ================\n");
console.log(partialFormatted2);
