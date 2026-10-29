<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

### 本地 PostgreSQL 和 Redis

在仓库根目录执行（需要 Docker Compose）：

```bash
docker compose up -d --wait
docker compose ps
```

默认连接配置：

- PostgreSQL：`postgresql://postgres:postgres@localhost:5433/knowlege_agent`
- Redis：`redis://localhost:6380`

可在根目录已有的 `.env` 中添加 `POSTGRES_USER`、`POSTGRES_PASSWORD`、
`POSTGRES_DB`、`POSTGRES_PORT`、`REDIS_PORT` 覆盖默认值。
PostgreSQL 用户、密码和库名只在数据卷首次初始化时生效。
这些默认配置用于本地开发，端口仅绑定本机。

停止服务：`docker compose down`。数据保存在 Docker 数据卷中；
`docker compose down -v` 会删除数据库数据。

```bash
$ pnpm install
```

### COS 文件生命周期

新上传的参考图先写入 `knowlege-agent/tmp/日期/`。提交生图任务时，后端校验图片并复制到 `knowlege-agent/references/`，数据库保存正式 key；前端同步使用返回的正式 key，以便后续复用。

临时目录配置 1 天到期删除，由 COS 每日扫描并异步清理，不保证上传满 24 小时立即删除。正式参考图、`generated-images/` 中的生成结果和旧 `upload-tests/` 文件不适用这条规则，历史记录仍可正常读取。提交写库失败时，后端确认没有已提交记录后会尝试清理本次正式副本；若数据库持续不可用，则保留副本并记录错误，避免误删已经提交的文件。

在 `apps/nest-server` 目录读取 `.env` 中的存储配置，查看或应用规则（需要桶生命周期读写权限）：

```bash
pnpm storage:lifecycle
pnpm storage:lifecycle --apply
```

脚本保留桶内其他规则，只新增或更新 `knowlege-agent-expire-temporary-uploads`；不会在服务启动时自动修改桶配置。

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## 模型配置

文本模型和生图模型都由前端“模型配置”页面维护，服务端不再读取 `OPENAI_*`、`IMAGE_*` 和
`MODEL_STREAM_INCLUDE_USAGE` 环境变量。

- 在页面填写类型（文本/图片）、配置名称、服务商 API 根地址、模型名称、API Key 和单价。
- 每种类型固定一个默认模型：模型参数对比的每个任务可以另外选择文本模型，图片生成页可以选择生图模型。
- API Key 使用 AES-256-GCM 加密后保存在 PostgreSQL，接口只返回打码后的提示，完整密钥不会返回浏览器。
- 单价与配置一起保存：文本模型填输入/缓存输入/输出价格（元/百万 tokens），图片模型填每张价格（元/张）。
  价格行的键是“类型 + 服务商地址 + 模型名”，与调用记录取价的键一致，因此两条配置指向同一个模型时共用一份单价；
  留空表示不估算成本（用量监控里显示“未填单价”）。

服务端只需在 `.env` 中提供加密主密钥（至少 16 个字符）：

```bash
MODEL_CONFIG_SECRET=$(openssl rand -hex 32)
```

更换该密钥后，已保存的模型 API Key 无法解密，需要在页面重新填写。数据库不可用时模型配置不可读写，
模型调用会被拒绝，避免出现完全无记录的付费请求。

运行时按模型 id 读取配置详情并缓存（每种类型的默认模型另外缓存一个 id），所以生图和模型对比请求只在
缓存未命中时才查库；同一进程内修改配置会立刻清掉对应缓存（编辑只清这条，切换默认只清默认指针），
其他实例或直接改库带来的变化最多滞后一个缓存有效期。

有效期默认 5 分钟，可用 `MODEL_CONFIG_CACHE_TTL_MS`（毫秒）调整，设为 `0` 表示永不过期、只依赖写操作清理：

```bash
MODEL_CONFIG_CACHE_TTL_MS=600000   # 10 分钟
```

API Key 每次调用时才从密文解密，明文不会长期留在内存里。

## 模型参数对比

使用页面“模型配置”中添加的文本模型，需要支持 OpenAI 兼容的 Chat Completions 流式接口。
启动服务后，`/api/model-comparison/run` 接收 AG-UI 运行请求并以 SSE 返回 AG-UI
事件；请求中的 `state.modelId` 指定任务使用的模型，缺省时使用默认文本模型，指定的模型已删除时返回
404 而不是静默切换模型。密钥仅用于服务端请求，不会返回浏览器。该接口供本地演示使用，公开部署前需自行配置访问控制。

## 模型用量监控

文本和图片模型请求在发往上游前必须写入 PostgreSQL；数据库不可用时会拒绝新调用。监控记录从启用后开始，不包含旧图片任务。服务商标识为模型配置中的 API 根地址（不含查询参数），单价在“模型配置”页面与模型一起维护，费用按请求开始时的价格估算，仅供参考。

用量上报由模型配置里的“请求返回用量”开关控制（对应 `stream_options.include_usage`）。如果服务商不支持该选项，
在页面关闭这个开关；用量是否返回仍取决于服务商。页面断开后文本请求会继续完成，以便取得用量，仍可能产生费用。请求中断、进程退出或结果写库失败可能留下未确认记录，需要结合服务商账单核对。

