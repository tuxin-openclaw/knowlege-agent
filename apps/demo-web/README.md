# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## 模型参数对比

在 `apps/nest-server/.env` 中配置 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL_NAME`（需支持 OpenAI 兼容 Chat Completions 流式接口）。在仓库根目录执行 `pnpm dev:demo`，可同时启动前端和后端；按 Ctrl+C 停止。从前端导航进入“模型参数对比”。提示词由所有任务共享，参数和输出各自独立；新增任务后可逐个生成或一键生成全部。运行结果仅保留在当前页面，重新生成会覆盖对应面板的结果。

参数支持范围取决于具体模型，上游服务可能拒绝某些取值；采样具有随机性，相同设置也可能得到不同回答。

每个任务可独立开关思考模式，默认关闭以便测试 Temperature。使用 DeepSeek 官方接口时，思考模式下 Temperature 不生效；Top P 的支持范围取决于具体模型和模式。其他 OpenAI 兼容服务是否支持该开关，以服务提供商的接口为准。
