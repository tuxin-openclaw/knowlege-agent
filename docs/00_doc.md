# 知识地图

## 输入
- Tool
- MCP：可跨进程调用的 Tool
- Prompt Template：组件化管理 prompt
- 语音交互：ASR + 流式 TTS 

## RAG：检索增强生成
- 输入类型：上文 Context
  - 系统提示词 System Prompt
  - 用户最新提问 User Input
  - 历史对话上下文 History
  - Few-shot 示例 Examples
  - 工具定义/函数描述 Tool Schema
  - 工具调用返回结果 Tool Output
  - 知识库/检索文本 Retrieved Docs
  - 用户画像/长期记忆 User Profile
- [Memory：记忆管理](Memory.md)
- [Embedding：向量化](Embedding.md)
- [Multi Agent：用 LangGraph 编排工作流](Multi-Agent.md)
- [Agentic RAG：大模型自主决策的 RAG 闭环系统](Agentic-RAG.md)
- [混合检索 RAG：多路召回 + 重排模型](混合检索RAG.md)
- [Neo4j 知识图谱和 Graph RAG](知识图谱.md)
- PostgreSQL：AI 时代最适合的数据库。它可以通过 pgvector 插件实现向量字段，以及语义检索。
- Redis：Agent 短期记忆存储的最佳方案
- [Mem0：分层记忆 + 三路召回的长期记忆方案](Mem0.md)
- [RabbitMQ: Agent 中异步处理的标配方案](RabbitMQ.md)

## 输出
- Output Parser：结构化大模型输出
- AGUI(Agent-User Interaction Protocol) 协议：Vercel AI SDK 实现流式组件渲染

## 工程化
- Runnable：将代码步骤逻辑组装成 chain
- [LangSmith 全链路观测](LangSmith-全链路观测.md)
- [DeepAgents](DeepAgents.md)
- [Agent 的对象存储方案：MinIO、RustFS、阿里云OSS](Agent-的对象存储方案.md)
- [LangFuse：开源可内网部署的 Agent 全链路监测方案](LangFuse.md)

## 自动化
- 定时任务

## 实战
- [多Agent架构的深度调研助手](多Agent架构的深度调研助手.md)
- 多模态与 OSS 前端直传实战：AI 画板

## 原理
- [Transformer 架构](Transformer架构.md)
- 大模型本质：根据上文，预测下一个词
- Agent本质：通过循环，补充上文，引导持续决策
- [大模型训练、推理全流程](大模型训练推理全流程.md)

