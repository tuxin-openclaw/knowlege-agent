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

在仓库根目录执行 `pnpm dev:demo`，可同时启动前端和后端；按 Ctrl+C 停止。文本模型和生图模型都在“模型配置”页面添加（类型、名称、服务商 API 根地址、模型名称、API Key），不再需要配置 `OPENAI_*`、`IMAGE_*` 环境变量；服务端只需在 `apps/nest-server/.env` 提供加密主密钥 `MODEL_CONFIG_SECRET`。

从前端导航进入“模型参数对比”：每个任务可以选择不同的文本模型并独立设置采样参数，提示词由所有任务共享，输出各自独立；新增任务后可逐个生成或一键生成全部。运行结果仅保留在当前页面，重新生成会覆盖对应面板的结果。未选择模型时使用该类型的默认模型，没有配置文本模型时会提示先到“模型配置”添加。

参数支持范围取决于具体模型，上游服务可能拒绝某些取值；采样具有随机性，相同设置也可能得到不同回答。

每个任务可独立开关思考模式，默认关闭以便测试 Temperature。使用 DeepSeek 官方接口时，思考模式下 Temperature 不生效；Top P 的支持范围取决于具体模型和模式。其他 OpenAI 兼容服务是否支持该开关，以服务提供商的接口为准。

“图片生成”页面可以选择生图模型，默认使用“模型配置”里图片类型的默认模型。“模型用量监控”页面展示经过本服务的文本和图片调用；人民币单价在“模型配置”页面和模型一起填写（文本按元/百万 tokens，图片按元/张），费用依据调用时的价格快照估算。未填单价、用量未知或未确认的调用不会计入费用汇总。

## 组件库

界面组件来自工作区内的 `@knowledge/ui`（`packages/ui`，基于 shadcn/ui + Tailwind CSS v4），按需从源码引入：

```tsx
import { Button } from "@knowledge/ui/components/button";
```

接入点在两个地方：

- `vite.config.ts`：插件列表里加 `tailwindcss()`；
- `src/index.css`：`@import "@knowledge/ui/globals.css"` 引入 Tailwind 与主题令牌，再用 `@source` 告诉 Tailwind 去扫描组件库源码，否则组件里的类名会被裁掉。

主题令牌（`--primary`、`--border` 等）在 `packages/ui/src/styles/globals.css` 里定义，已经对齐本站的浅绿配色；页面底色由 `src/index.css` 自己设置。

“模型配置”页面已经全部改用组件库实现；其余三个页面仍是原生标签 + 各自的 CSS，两者的样式规则互不影响（`model-usage.css` 里针对原生表格的规则已经收进 `.usage-table` 作用域）。新增组件的方法见 `packages/ui/README.md`。

