# 开发记录

## 创建全局前后端项目
### 前端
```sh
pnpm create vite apps/demo-web --template react-ts
```
- 使用 oxlint，vscode 安装 oxc.oxc-vscode 来显示 oxlint 错误

### 后端
```sh
npx @nestjs/cli new nest-server --skip-git
```

### 数据库
docker-compose：postgres + redis

## 接入对象存储
- 使用 AWS S3 协议，兼容不同对象存储方案。
- **前端直传**：后端生成临时签名，浏览器通过签名把文件直接传到对象存储。
- 文件生命周期管理。
- 文件访问链接都是有时效的签名 URL。