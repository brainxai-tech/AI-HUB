# AI 工作汇报生成器

本项目是 AI-HUB 的非游戏工具之一。用户只需在 Hub 配置一次 AI Routing Key；项目页面不会要求、接收或保存用户 API Key。

## 统一模型规则

- 真实生成请求只发送到 Hub 项目级代理。
- 项目身份固定为 `ai-work-report-generator`，项目路径为 `/work-report`。
- 仅接受 Hub 中启用且已配置的 `openai` 路由与 `gpt-*` 型号。
- 当前项目型号显示在页面中；切换型号请使用页面顶部统一模型选择器。
- 项目内部没有厂商按钮、模型下拉框或 API Key 输入框。
- 浏览器只向项目服务端提交汇报类型、表达风格、原始记录和可选背景信息。

## 本地运行

先启动 Hub（默认 `4194`），再执行：

```bash
npm install
npm run verify
npm start
```

项目默认监听 `4202`。共享启动器会注入项目级身份；`HUB_PROJECT_TOKEN` 如存在，只在服务器到 Hub 的请求头中使用，不会发送到浏览器。

## 源码恢复说明

服务器现存 release 不包含原始 TS/TSX 工程。仓库保存的是从实际 `current` release 解引用迁移并统一化后的可运行 JavaScript 产物，未声称恢复完整 TypeScript/React 源码。详情见 [SOURCE-RECOVERY.md](./SOURCE-RECOVERY.md)。
