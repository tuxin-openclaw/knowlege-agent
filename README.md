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
