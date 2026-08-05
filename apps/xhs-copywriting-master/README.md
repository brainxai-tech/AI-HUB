# 小红书文案写作大师

一个可运行的 Next.js MVP，用于生成小红书标题、正文、标签和发布建议。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

## 重启电脑后打开

双击项目里的 `start-xhs-copywriting-master.bat`。

这个脚本会自动启动本地服务并打开浏览器。服务窗口会最小化保留，关闭这个窗口后网页也会停止响应。

## AI 配置

本项目不直接保存或读取模型厂商 API Key。真实生成统一通过 AI Hub 的模型网关完成，API Key 只在 AI Hub 的模型配置页维护。

复制 `.env.example` 为 `.env.local`，填入 Hub 地址和项目 token：

```bash
AI_HUB_BASE_URL=http://127.0.0.1:4310/hub
AI_HUB_PROJECT_TOKEN=your_hub_project_token
```

`AI_HUB_PROJECT_TOKEN` 需要与 AI Hub 服务端的 `HUB_PROJECT_TOKEN` 一致。模型供应商、模型名和 API Key 在 AI Hub 中配置；本项目默认使用 Hub 的默认 provider/model。只有本地开发时可以显式设置 `ALLOW_MOCK_GENERATION=true` 使用 mock，生产环境会忽略该开关。

如果部署到 AI Hub 子路径，例如 `https://your-domain.example/xhs/`，构建和运行时还需要设置：

```bash
BASE_PATH=/xhs
NEXT_PUBLIC_BASE_PATH=/xhs
```

## 已实现

- 文案 brief 表单
- 文案类型、语气、字数控制
- 通过 AI Hub 生成标题、正文、标签、发布建议
- 本地开发 mock 模式
- 快捷优化入口
- 复制反馈
- localStorage 历史记录
- 响应式工作台布局
