# 多Agent架构的深度调研助手
## 4个AGENT
1. 主 Agent：整个系统的编排中心。
2. 调研 Agent：每次只负责一个聚焦的子主题。
3. 分析 Agent：当调研涉及数字对比、排名、增长率等计算时启用。
4. 编辑 Agent：在报告草稿完成后介入，返回具体修改建议。

## 实现步骤
1. 配置 .env
   - 配置 langsmith
   - 配置网络搜索 apiKey
2. 创建 tool：search
3. 声明4个 agents 并创建