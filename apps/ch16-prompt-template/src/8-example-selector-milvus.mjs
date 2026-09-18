/**
 * 示例选择器
 * @description 当示例较多时，可以使用示例选择器来选择最合适的示例，避免 tokens 消耗过大
 */
import { FewShotPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { Milvus } from "@langchain/community/vectorstores/milvus";
import {
  client,
  VECTOR_DIM,
  connectMilvus,
  getEmbedding,
  MILVUS_ADDRESS,
  embeddings,
} from "@knowledge/ai-utils";
import { SemanticSimilarityExampleSelector } from "@langchain/core/example_selectors";
import { IndexType, MetricType, DataType } from "@zilliz/milvus2-sdk-node";

const COLLECTION_NAME = "example_selector";
const indexCreateOptions = {
  collection_name: COLLECTION_NAME,
  field_name: "vector",
  index_type: IndexType.IVF_FLAT,
  metric_type: MetricType.COSINE,
  params: { nlist: 1024 },
};

try {
  // 2. 定义单条示例的 Prompt 模板
  const examplePrompt = PromptTemplate.fromTemplate(`
  用户需求: {scenario}
  周报片段示例:
  {report_snippet}
  ---
  `);

  await ensureCollection();

  // 3. 构造一批长度差异明显的示例，方便观察选择效果
  await insertExamples();

  // 4. 创建 LengthBasedExampleSelector
  const exampleSelector = await getExampleSelector();

  // 5. 基于 selector 构建 FewShotPromptTemplate
  const fewShotPrompt = new FewShotPromptTemplate({
    prefix:
      "下面是一些不同风格和长度的周报片段示例，你可以从中学习语气和结构：\n",
    examplePrompt,
    exampleSelector,
    suffix:
      "\n现在请根据上面的示例风格，为下面这个场景写一份新的周报：\n" +
      "场景描述：{scenario}\n" +
      "请输出一份适合发给老板和团队同步的 Markdown 周报草稿。",
    inputVariables: ["scenario"],
  });

  const scenario1 =
    "我们本周主要是在清理历史技术债：重构老旧的订单模块、补齐核心接口的单测，" +
    "同时也完善了一些文档，方便后面新人接手。整体没有对外大范围发布的新功能。";
  const scenario2 =
    "本周完成新一代运营看板的首批功能上线，重点打通埋点和实时数仓链路，" +
    "并面向运营和市场同学做了多场宣讲，希望更多同学开始使用新能力。";

  const finalPrompt1 = await fewShotPrompt.format({
    scenario: scenario1,
  });

  const finalPrompt2 = await fewShotPrompt.format({
    scenario: scenario2,
  });

  console.log("\n===== 场景 1：技术债清理为主 =====\n");
  console.log(finalPrompt1);

  console.log("\n===== 场景 2：新功能首发 + 对外宣传 =====\n");
  console.log(finalPrompt2);
} catch (error) {
  console.log("❌ ~ error:", error);
}

async function ensureCollection() {
  try {
    await connectMilvus();
    const hasCollection = await client.hasCollection({
      collection_name: COLLECTION_NAME,
    });
    if (!hasCollection.value) {
      await client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            max_length: 100,
            is_primary_key: true,
          },
          {
            name: "scenario",
            data_type: DataType.VarChar,
            max_length: 2000,
          },
          {
            name: "report_snippet",
            data_type: DataType.VarChar,
            max_length: 10000,
          },
          {
            name: "vector",
            data_type: DataType.FloatVector,
            dim: VECTOR_DIM,
          },
        ],
      });
    }

    await client.createIndex(indexCreateOptions);

    await client.loadCollection({
      collection_name: COLLECTION_NAME,
    });
  } catch (error) {
    console.log("❌ ~ ensureCollection ~ error:", error);
  }
}

async function insertExamples() {
  const examples = [
    {
      scenario: "支付系统稳定性治理，强调风险防控、告警收敛和应急预案完善。",
      report_snippet:
        "- 本周聚焦支付链路稳定性，共处理 P1 事故 1 起、P2 事故 2 起，均在 SLA 内完成修复；\n" +
        "- 针对历史高频超时问题，完成 3 个关键链路的超时阈值和重试策略优化；\n" +
        "- 优化告警策略，合并冗余告警 10 条，新增 5 条基于 SLO 的告警规则。",
    },
    {
      scenario:
        "新功能首发，更多是对外展示亮点，如新看板、新能力上线，适合给较大量跨部门同学。",
      report_snippet:
        "- 上线「运营实时看板」，支持业务实时查看核心转化漏斗；\n" +
        "- 打通埋点 → 数据仓库 → 实时服务的闭环，支撑后续精细化运营；\n" +
        "- 组织 2 场跨部门分享，帮助非技术同学理解新能力的业务价值。",
    },
    {
      scenario:
        "重大版本发布节奏紧凑，需要对外同步一揽子新能力，强调可视化展示和业务价值。",
      report_snippet:
        "- 正式发布「增长分析 2.0」版本，新增留存分群、活动追踪等 5 项核心能力；\n" +
        "- 与市场同学联合输出季度解读文档，并在周会中向核心干系人进行路演；\n" +
        "- 配合运营梳理了 3 条重点推广场景，推动更多业务线接入新能力。",
    },
    {
      scenario:
        "偏向产品体验优化和灰度试点，虽然不是大规模首发，但需要让老板看到长期演进方向。",
      report_snippet:
        "- 针对「自助配置」后台完成一轮体验优化，减少 3 个关键操作步骤，提升整体可用性；\n" +
        "- 在小流量场景下灰度上线「智能推荐」能力，观察首周转化率提升约 3 个百分点；\n" +
        "- 拉通产品、运营和数据同学，对后续两个月的产品升级路线图达成一致。",
    },
    {
      scenario:
        "技术治理为主，核心工作是重构、单测补齐、文档完善，节奏偏稳，不强调对外大新闻。",
      report_snippet:
        "- 对老旧结算模块进行分层重构，拆出 3 个独立子模块，代码结构更加清晰；\n" +
        "- 补齐 25 条关键路径单元测试用例，整体覆盖率从 55% 提升到 68%；\n" +
        "- 完成 2 份系统设计文档补全，方便后续同学接手维护。",
    },
    {
      scenario:
        "以老系统拆分和代码瘦身为主，更多是内部质量提升，重点在于风险可控和长期维护成本下降。",
      report_snippet:
        "- 拆分历史「大单体」服务中的账务子模块，沉淀为独立结算服务，减少跨模块耦合；\n" +
        "- 清理 30+ 条废弃接口和配置项，并在网关层加保护，降低后续演进阻力；\n" +
        "- 对关键重构路径补充回滚预案和演练手册，保证发布过程可控。",
    },
    {
      scenario:
        "聚焦测试补齐和监控完善，希望通过一轮技术债治理把「隐性风险」暴露并关闭。",
      report_snippet:
        "- 新增 40+ 条端到端回归用例，覆盖主交易链路和高风险边界场景；\n" +
        "- 完成核心链路埋点和监控指标补齐，为后续 SLO 建设打下基础；\n" +
        "- 针对本周发现的 3 个潜在性缺陷，拉齐改进方案并排入后续技术债清单。",
    },
    {
      scenario:
        "偏向团队协作和流程优化，比如值班轮值、需求评审机制、跨团队沟通等软件建设。",
      report_snippet:
        "- 完成新一轮值班排班和值班手册更新，降低新同学值班心理压力；\n" +
        "- 优化需求评审流程，引入「技术风险清单」模板，帮助更早发现潜在问题；\n" +
        "- 与运维、产品同学一起梳理了故障复盘模板，后续复盘将更聚焦于可执行改进项。",
    },
  ];

  // 获取向量
  const insertData = await Promise.all(
    examples.map(async (example, index) => {
      const vector = await getEmbedding(
        example.report_snippet + example.scenario,
      );
      return {
        id: `example_${index + 1}`,
        scenario: example.scenario,
        report_snippet: example.report_snippet,
        vector,
      };
    }),
  );

  const insertResult = await client.insert({
    collection_name: COLLECTION_NAME,
    data: insertData,
  });
  console.log(`✓ 已插入 ${insertResult.insert_cnt} 条记录`);
}

async function getExampleSelector() {
  // 基于已存在的集合创建向量库
  const vectorStore = await Milvus.fromExistingCollection(embeddings, {
    collectionName: COLLECTION_NAME,
    clientConfig: {
      address: MILVUS_ADDRESS,
    },
    indexCreateOptions,
  });

  return new SemanticSimilarityExampleSelector({
    vectorStore,
    k: 2, // 每次只选出语义相近的 k 条示例
  });
}
