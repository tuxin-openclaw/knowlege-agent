/**
 * 带少量示例的 prompt
 */
import { model } from "@knowledge/ai-utils";
import {
  ChatPromptTemplate,
  FewShotChatMessagePromptTemplate,
  FewShotPromptTemplate,
  PromptTemplate,
} from "@langchain/core/prompts";

const examplePrompt = ChatPromptTemplate.fromMessages([
  [
    "human",
    `用户输入: {user_requirement}
期望周报结构: {expected_style}`,
  ],
  ["ai", "{report_snippet}"],
]);

const examples = [
  {
    user_requirement:
      "重点突出稳定性治理，本周主要在修 Bug 和清理技术债，适合发给偏关注风险的老板。",
    expected_style: "语气稳健、偏保守，多强调风险识别和已做的兜底动作。",
    report_snippet:
      "- 支付链路本周共处理线上 P1 Bug 2 个、P2 Bug 3 个，全部在 SLA 内完成修复；\n" +
      "- 针对历史高频超时问题，完成 3 个核心接口的超时阈值和重试策略优化；\n" +
      "- 清理 12 条重复/保留告警，减少值班同学 30% 的告警打扰。",
  },
  {
    user_requirement:
      "偏向对外展示成果，希望多写一些亮点，适合发给更大范围的跨部门同学。",
    expected_style: "语气积极、突出成果，对技术细节做适度抽象。",
    report_snippet:
      "- 新上线「订单实时看板」，业务侧可以实时查看核心转化漏斗；\n" +
      "- 首次打通埋点 → 数据仓库 → 实时服务链路，为后续精细化运营提供基础能力；\n" +
      "- 和产品、运营一起完成 2 场内部分享，会后收到 15 条正向反馈。",
  },
];

const fewShotExamples = new FewShotChatMessagePromptTemplate({
  examplePrompt,
  examples,
  exampleSelector: "\n\n", // 示例之间的分隔符，影响 formatMessages 的输出
  inputVariables: [],
});

const chatPrompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个周报生成助手"],
  ["system", "下面是若干参考案例，请学习它们的写作风格："],
  fewShotExamples,
  ["human", "这是我本周的实际工作内,请帮我写周报：{input}"],
]);

const messages = await chatPrompt.formatMessages({
  input:
    "本周完成了订单模块的一轮重构,拆分了历史遗留的大文件,并外齐了核心路径的单测;同时修复了两起线上性能问题,并把指标接入统一监控看板。",
});

const stream = await model.stream(messages);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
