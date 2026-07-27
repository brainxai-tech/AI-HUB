# AI Project Hub

AI 项目汇集库，用来集中展示项目入口，并提供统一模型配置和共享模型网关。

项目数据放在 `public/projects.js`。页面会把项目渲染成可搜索、可筛选、可点击跳转的入口卡片。

## 运行

```powershell
npm start
```

默认地址：

```text
http://127.0.0.1:4194/
```

## 统一模型网关

hub 后端提供这些接口：

```text
GET  /api/health
GET  /api/model-config
PUT  /api/model-config
POST /api/provider-models
POST /api/chat
POST /api/v1/chat/completions
```

模型统一通过 OpenAI 兼容的 AI Routing 入口转发：

```text
https://drhknode.airouting.com/v1
```

管理员在 `/hub/admin/` 输入自己的 AI Routing API Key，先从 `/v1/models`
获取模型列表，再选择默认模型并保存。Key 仅保存在 Hub 服务端配置中，不会通过
公开配置接口回显。输入密钥时必须使用 HTTPS 或 SSH 隧道。

`PUT /api/model-config` 需要管理口令：

```text
X-Hub-Admin-Token: <HUB_ADMIN_TOKEN>
```

项目服务端调用模型网关时使用项目口令：

```text
X-Hub-Project-Token: <HUB_PROJECT_TOKEN>
```

不要把 `HUB_PROJECT_TOKEN` 写进浏览器前端代码。浏览器项目应先请求自己的后端，再由后端调用 hub 网关。

OpenAI 兼容调用示例：

```js
const response = await fetch("http://127.0.0.1:4194/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-project-token": process.env.HUB_PROJECT_TOKEN,
  },
  body: JSON.stringify({
    provider: "routing",
    model: "<从 AI Routing 模型列表中选择的模型 ID>",
    messages: [{ role: "user", content: "你好" }],
  }),
});

const data = await response.json();
```

生产环境公网路径：

```text
http://47.84.108.192/hub/api/v1/chat/completions
```

## 添加项目

以后把项目填到 `public/projects.js`：

```js
window.AI_PROJECTS = [
  {
    id: "unique-project-id",
    name: "AI · 项目名称",
    description: "一句话说明这个 AI 项目做什么。",
    url: "https://example.com",
    category: "实用工具",
    stage: "live",
    tags: ["Agent", "Web"],
    updatedAt: "2026-06-25",
  },
];
```

## 验证

```powershell
npm run verify
```

## 原子发布与回滚

生产版本放在 `/opt/ai-project-hub/releases/<commit>`，`/opt/ai-project-hub/current`
只通过原子软链切换。密钥和运行数据分别保留在 `/etc/ai-project-hub`、
`/var/lib/ai-project-hub` 和 `/var/log/ai-project-hub`，不得打入 release 包。

从已验证的 Git 提交生成并上传 release：

```bash
commit=$(git rev-parse --short HEAD)
git archive --format=tar.gz --output="ai-project-hub-$commit.tar.gz" HEAD
scp "ai-project-hub-$commit.tar.gz" admin@server:/home/admin/staging/releases/
sudo /opt/ai-project-hub/current/deploy/deploy.sh \
  "/home/admin/staging/releases/ai-project-hub-$commit.tar.gz" "$commit"
```

部署脚本会先拒绝 `.env`、`data/`、`backups/` 和 `.git`，再运行完整验证，
备份 Nginx/systemd 配置，原子切换 `current`，重启并检查本机与 Nginx 健康端点。
任一步失败都会恢复上一个软链和配置。

回滚到上一个成功版本，或指定已保留的提交：

```bash
sudo /opt/ai-project-hub/current/deploy/rollback.sh
sudo /opt/ai-project-hub/current/deploy/rollback.sh <commit>
```
