# LangFuse

## 对比 LangSmith
### 部署与成本：
- Langsmith 闭源，默认 SaaS 托管。零运维、按量收费，高 tracing 量生产环境成本高。企业版提供私有化自托管方案，但成本极高。
- LangFuse 支持 Cloud 版 + 自建开源部署，生产环境零成本部署、数据自主可控，无用量扣费压力。

### 框架适配性:
- LangSmith 深度绑定 LangChain/LangGraph，原生零成本配置，但其他框架兼容差；
- LangFuse 基于 OpenTelemetry 埋点，适配任意 Agent 框架，如技术栈要求。

## 部署
curl -o docker-compose.yml https://raw.githubusercontent.com/langfuse/langfuse/main/docker-compose.yml