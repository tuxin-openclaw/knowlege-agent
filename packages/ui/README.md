# @knowledge/ui

基于 [shadcn/ui](https://ui.shadcn.com) 的共享组件库，样式走 Tailwind CSS v4。组件是源码直出的，不是编译产物：应用直接 import `packages/ui/src` 下的 `.tsx`，由自己的打包器（Vite）转译。

## 结构

```
packages/ui
├── components.json            shadcn CLI 配置（style: new-york）
└── src
    ├── components/ui/*.tsx    shadcn 组件
    ├── lib/utils.ts           cn()：clsx + tailwind-merge
    └── styles/globals.css     Tailwind 入口 + 主题令牌
```

## 在应用里使用

1. `package.json` 加依赖 `"@knowledge/ui": "workspace:*"`。
2. 应用的 CSS 入口引入主题（Tailwind 的指令也在这一层）：

```css
@import "@knowledge/ui/globals.css";
@source "../../../packages/ui/src"; /* 相对该 CSS 文件，让 Tailwind 扫描组件里的类名 */
```

3. 应用需要装 `tailwindcss` 与 `@tailwindcss/vite`，并在 `vite.config.ts` 里加 `tailwindcss()` 插件。

按需引入：

```tsx
import { Button } from "@knowledge/ui/components/button";
import { cn } from "@knowledge/ui/lib/utils";
```

## 新增组件

在仓库根目录执行（`--cwd` 指向本包，CLI 会把文件放进 `src/components/ui/` 并自动装依赖）：

```bash
pnpm dlx shadcn@latest add <组件名> --cwd packages/ui -y
```

生成后追加两件收尾工作：

- 去掉文件首行的 `"use client"`（本项目不是 RSC）；
- 把 `import { cn } from "cn"` 改成 `import { cn } from "@knowledge/ui/lib/utils"`，避免装一个同名的第三方 `cn` 包。

新增依赖后回到仓库根目录跑一次 `pnpm install`。

## 主题令牌

`src/styles/globals.css` 的 `:root` 里是语义令牌（`--primary`、`--border` 等），沿用 demo-web 现有的浅绿配色。应用要换皮肤就覆盖这些变量，不用改组件。

注意两个容易搞混的点：

- `--background` 是**组件**用的底色（弹框、输入框），这里是白色；页面底色由各应用自己设（demo-web 是浅绿 `#f7f8f2`）。
- `--card` 也是白色，卡片类容器用它。
