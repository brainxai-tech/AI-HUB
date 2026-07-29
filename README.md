# AI Project Hub

AI-HUB 集中展示 AI 项目，并提供统一的 AI Routing Key 配置、GPT 型号目录、项目独立型号选择和项目级模型代理。

## 全新克隆与一键启动

```powershell
git clone https://github.com/brainxai-tech/AI-HUB.git
cd AI-HUB
npm run workspace:install
npm run workspace:verify
.\打开本地AI-HUB.cmd
```

首次打开后进入 `http://127.0.0.1:4194/hub/key-config/`，只需在 Hub 配置一次自己的 AI Routing Key。之后所有非游戏 AI 项目都通过 Hub 项目级代理使用 GPT 型号；项目页面不填写、接收或保存 API Key。

一键启动包含四个本地服务：

| 服务 | 端口 | 用途 |
|---|---:|---|
| Hub | 4194 | 首页、Key 配置、统一模型目录、本地同源入口与项目级代理 |
| shared-project-runtime | 4195 | 27 个共享项目的页面与 API 适配 |
| AI PPT 汇报教练 | 4201 | 文件解析、GPT 汇报生成和 PPTX 导出 |
| AI 工作汇报生成器 | 4202 | 日报、周报和月报生成 |

停止本地套件：

```powershell
.\stop-local-suite.ps1
```

`start-ai-project-hub.cmd` 只启动 Hub 单进程，保留给网关调试；完整体验请使用上面的一键入口。

## 统一模型规则

- Hub 只展示和接受 `gpt-*` 型号。
- 每个项目通过页面顶部统一选择器独立保存当前 GPT 型号。
- 浏览器只向项目同源 API 发送业务输入。
- shared runtime 或专用项目服务端为请求注入项目身份，再调用 Hub。
- 用户 Key 只保存在 Hub 服务端配置中，不回显到公开配置，也不会写进项目代码。

统一调用链：

```text
项目页面 -> 项目同源 /api -> shared/dedicated runtime -> Hub 项目级代理 -> AI Routing
```

## 常用验证命令

```powershell
npm run verify
npm run workspace:build
npm run workspace:verify
npm run security:scan
npm run e2e
```

`workspace:verify` 会按 `deploy/project-manifest.json` 验证 29 个非游戏项目；`e2e` 使用本机模拟上游，不需要真实 Key，并验证 29 个项目页面、统一型号选择和工作汇报浏览器生成链路。

## Hub API

```text
GET  /hub/api/health
GET  /hub/api/model-config
PUT  /hub/api/model-config
POST /hub/api/provider-models
GET  /hub/api/project-model-selection
PUT  /hub/api/project-model-selection
POST /hub/api/chat
POST /hub/api/v1/chat/completions
```

生产环境中，配置写入需要 `X-Hub-Admin-Token`，项目模型调用需要项目级 `X-Hub-Project-Token`。这些口令都不得进入浏览器代码、Git、日志或构建产物。输入真实 Key 时必须使用 HTTPS、SSH 隧道或本机回环地址。

## 项目清单与源码约定

- `apps/<project-id>/`：29 个非游戏项目。
- `packages/shared-project-runtime/`：统一页面服务与 API 适配层。
- `public/`：Hub 首页、Key 配置页、型号选择器和共享视觉资源。
- `deploy/project-manifest.json`：项目 ID、路由、源码目录、技术栈和运行方式的唯一清单。
- `SOURCE-RECOVERY.md`：仅有服务器 release 产物的项目会明确记录恢复边界，不声称拥有未恢复的 TS/TSX 源码。

不得提交 `.env`、真实 API Key、管理员口令、项目口令、SSH 私钥、`node_modules`、`.next`、日志、PID、用户数据或备份目录。

## 原子发布与回滚

生产版本放在 `/opt/ai-project-hub/releases/<commit>`，`/opt/ai-project-hub/current` 只通过原子软链接切换。密钥与运行数据分别保存在 `/etc/ai-project-hub`、`/var/lib/ai-project-hub` 和 `/var/log/ai-project-hub`，不得打入 release。

```bash
commit=$(git rev-parse --short HEAD)
git archive --format=tar.gz --output="ai-project-hub-$commit.tar.gz" HEAD
scp "ai-project-hub-$commit.tar.gz" admin@server:/home/admin/staging/releases/
sudo /opt/ai-project-hub/current/deploy/deploy.sh \
  "/home/admin/staging/releases/ai-project-hub-$commit.tar.gz" "$commit"
```

回滚：

```bash
sudo /opt/ai-project-hub/current/deploy/rollback.sh
sudo /opt/ai-project-hub/current/deploy/rollback.sh <commit>
```
