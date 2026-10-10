# DeepAgents
适合快速落地复杂 Agent 应用。底层依赖 LangGraph，原生 LangGrph 适合极致自定义、底层深度开发。

通过 langchain 提供的 createMiddleware 创建中间件
## 自带 Middlewares
1. createFilesystemMiddleware
2. createSkillMiddleware
3. createMemoryMiddleware
4. createSummarizationMiddleware
5. createSubAgentMiddleware
6. todoListMiddleware 创建 todo 任务列表给模型执行