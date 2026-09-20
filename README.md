# AGENT学习笔记

## RAG

> Retrieval 检索 - Augmented 增强 - Generation 生成
> 在原始 prompt 给到大模型之前，查询下知识库，把相关的文档作为背景知识加入到 Prompt 里，再让大模型回答，这就是 RAG。

### 向量

- 传统的关键词搜索无法准确的查询相关的文档。我们需要向量化 Vector，通过向量计算实现语义检索。
- 向量会分很多维度，两个向量的夹角越小相似度越高，即余弦相似度（两个向量夹角的余弦值）
- 把文档向量化存储到向量数据库，查询的时候也把 Prompt 向量化

### 嵌入模型 Embedding Model

与大模型不同，它只负责把知识转成向量。

## 知识库的 loader 和 splitter

- loader：把各种知识来源通过 loader 转化为文档存入知识库
- splitter：文档很大时，需要拆分文档

## 向量数据库 Milvus

> Milvus 根据语义匹配查询，可以用自然语言来检索

[下载 milvus docker 配置](https://github.com/milvus-io/milvus/releases)

[安装 Milvus GUI 工具](https://github.com/zilliztech/attu/releases)

## 记忆管理

- 截断：根据 token 数量来保留最近的 message
- 总结：调用大模型对之前的 message 生成一个摘要
- 检索：将 message 存入向量数据库进行检索

## 19. LangChain 整体总结

1. 为什么用LangChain：市面很多大模型，api 格式各不相同，LangChain 提供统一的 ChatModel api来调用各种大模型，屏蔽底层差异
   - ChatOpenAi
   - ChatDeepSeek
   - ChatAnthropic
   - ...
2. 输入控制
   1. 提示词组件化：prompt 可能很复杂，且会长期迭代，组件化方便复用
      - PromptTemplate
      - ChatPromptTemplate
      - FewShotPromptTemplate: 提供参考案例
      - @langchain/core/example_selectors: 案例太多，根据长度、语义等来做示例筛选
      - MessagePlaceholder: 给 PromptTemplate 注入对话记录（比如历史记录）
      - PipelinePromptTemplate: 多个 PromptTemplate 组合
   2. 记忆管理
      - ChatMessagesHistory: 把 messages 存到内存、redis、文件、数据库等
        - InMemoryChatMessageHistory
        - RedisChatMessageHistory
        - FileSystemChatMessageHistory
        - TypeORMChatMessageHistory: mysql 等数据库
      - 管理策略：截断、总结、检索
   3. 工具调用
      - tool_call
      - MCP Server
3. 输出控制 OutputParser
   - tool_call
     - model.bindTools([{ name: string, descriptions: string, schema: ZodSchema }])
   - model.withStructuredOutput
   - 模型原生 modelKwargs.response_format 定义 json_schema
   - JsonOutputToolsParser: 解析流式内容
   - StringOutputParser: 从各种格式取出内容，返回字符串
   - StructuredOutputParser: 按某种 JSON 格式返回内容并解析成对象
     - fromZodSchema
     - fromNamesAndDescriptions
   - XMLOutputParser: 安装 xml 格式返回内容并解析成对象
   - JsonOutputToolsParser: 解析 tool_call 的信息，支持流式
4. RAG
   1. loader 加载各种来源内容，用 Splitter 分割
   2. 内容存入向量数据库
   3. 向量检索相关文档
   4. 提示词加上相关文档让大模型生成回答
5. Runnable 声明式组织代码形成 chain
   - LCEL: LangChain Expression Language
   - 每个组件都实现了 Runnable 接口，如 ChatModel、OutputParser、PromptTemplate 等
   - RunnableSequence: 顺序执行
   - RunnableLambda：把函数包装成 Runnable
   - RunnableMap: 并行执行多个 chain，结果放在对象属性上
   - RunnableBranch: if else 逻辑
   - RouterRunnable: switch case 逻辑，根据 key 决定执行哪个 chain
   - RunnableEach: 循环数组每个元素来调用 chain
   - RunnablePassthrough: 拿到原始输入
   - RunnablePick: 取输入对象的某些属性返回
   - RunnableWithMessageHistory: 给 chain 加上 memory
   - Runnable 类api
     - withRetry
     - withFallbacks
     - withConfig
   - callbacks: chain.invoke(prompt, { callbacks: [cb] })
