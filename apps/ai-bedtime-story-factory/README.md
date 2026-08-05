# AI 睡前故事工厂

根据孩子年龄、主题、角色、场景和朗读风格，生成可直接朗读的晚安故事、分享卡片和续集线索。

## AI Hub 统一模式

- API Key 只在 AI Hub 的“API 配置”页面保存一次，本项目内不填写或保存 Key。
- 只使用 AI Routing 提供的 `gpt-*` 型号，不直连 DeepSeek、Gemini、Claude、Anthropic 或 OpenRouter。
- 每个项目可独立选择 GPT 型号；切换入口位于页面顶部的统一模型选择器。
- 项目内部不再显示厂商按钮或第二套模型下拉框。
- 实时模型暂不可用时，共享运行时会返回结构完整的本地故事兜底，页面不会空白。

## 使用方法

1. 从仓库根目录启动完整 AI Hub 套件。
2. 在 Hub 的“API 配置”中填写 AI Routing Base URL 和 API Key，并测试连接。
3. 从 Hub 首页打开“AI 睡前故事工厂”。
4. 在页面顶部选择这个项目使用的 GPT 型号。
5. 填写孩子年龄、主题、角色和语气，生成故事。

## 功能

- 适配 2–12 岁儿童的内容和词汇。
- 安静、轻快、耳语三种朗读风格。
- 输出故事正文、朗读版、分享文案、家长提示和续集线索。
- 服务端强制结构化 JSON，并做适龄与安全约束。

## 单独开发

```powershell
npm install
npm run dev
```

完整 GPT 能力依赖仓库中的 Hub 与共享项目运行时。

## 验证

```powershell
npm run typecheck
npm run test
npm run build
```

## 主要文件

- `src/App.tsx`：故事配置、Hub 状态和结果视图。
- `src/shared/contracts.ts`：只允许统一 `openai` 路由和 `gpt-*` 型号的契约。
- `server/providers.ts`：项目级 Hub 目录、GPT 过滤和聊天请求。
- `server/storyEngine.ts`：故事提示词、输出解析和本地兜底。
