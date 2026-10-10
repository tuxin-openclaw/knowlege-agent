# 混合检索 RAG：多路召回 + 重排模型
混合检索：全文/关键词检索 + 语义检索

用 rerank 重排模型对查到的结果进行排序，把最相关、最有用、最能支持回答的文档筛选出来，再丢给大模型，让回答更精准。

## 整体流程
- 用户输入
- 多路召回
  - 语义检索 milvus_recall
  - 关键词检索 es_recall
- 结果合并（去重）merge
- rerank
- 把高质量文档交给大模型

重排大模型：https://bailian.console.aliyun.com/cn-beijing/model/market/detail/qwen3.7-text-rerank?serviceSite=asia-pacific-china&ref=search_result&kw=%E9%87%8D%E6%8E%92