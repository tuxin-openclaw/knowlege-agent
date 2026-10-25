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