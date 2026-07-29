# AI HUB 源码迁移约定

本仓库的目标是让任何人从 GitHub 全新克隆后，填写自己的 AI Routing API Key，即可启动 HUB 和全部非游戏 AI 项目。

## 目录

- `apps/<project-id>/`：29 个非游戏项目的可构建源码。
- `packages/shared-project-runtime/`：项目统一 API 适配层；项目浏览器端不直接接触 API Key。
- `public/`：HUB 首页、Key 配置页、统一模型选择器和共享视觉资源。
- `deploy/project-manifest.json`：项目 ID、相对路由、源码位置和运行方式的唯一清单。
- `deploy/`：本地反向代理、Docker Compose 和服务器发布配置。

在完整迁移结束前，根目录继续作为 HUB 后端，避免破坏现有部署和历史测试。

## 统一调用链

```text
项目页面 -> 项目同源 /api -> shared-project-runtime -> HUB 模型网关 -> AI Routing
```

Key 只允许保存在 HUB 后端配置层。项目可选择 HUB 返回的 GPT 模型，但不得包含独立 Key 输入框、厂商 Key 或硬编码线上地址。

## 导入规则

每个项目只导入可维护源码和必要资源。以下内容不得进入 Git：

- `.env`、真实 API Key、管理员口令、项目口令、SSH 私钥；
- `node_modules`、`.next`、`dist`、`dist-server` 等可重新生成的构建产物；
- 日志、PID、运行数据、用户上传、备份目录和历史发布包；
- 服务器专属绝对路径和线上 IP。

每个项目导入后必须完成依赖安装、测试/类型检查、构建、密钥扫描和相对路由验收。
