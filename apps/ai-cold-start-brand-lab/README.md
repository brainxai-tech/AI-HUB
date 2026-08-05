# AI 冷启动品牌实验室

输入产品想法，生成品牌命名、定位、广告语、用户画像、落地页方向和可复制的首页文案。

## AI Hub 统一模式

- Routing Key 只在 AI Hub 的“API 配置”页面保存一次，本项目不接收或保存 API Key。
- 只允许 AI Routing 提供的 `gpt-*` 型号，不直连 DeepSeek、Gemini、Claude、Anthropic 或 OpenRouter。
- GPT 型号在页面顶部的统一选择器中按项目独立选择，项目内没有第二套厂商或模型控件。
- 模型请求通过 Hub 的项目级代理发送，并用项目内部口令隔离权限。
- 实时模型不可用时，共享运行时提供结构化本地品牌包兜底。

## 使用方法

1. 从仓库根目录启动完整 AI Hub 套件。
2. 在 Hub 的“API 配置”中保存 AI Routing Base URL 与 API Key，并测试连接。
3. 打开“AI 冷启动品牌实验室”，在页面顶部选择本项目使用的 GPT 型号。
4. 输入产品想法、首批用户、市场和表达风格，生成品牌包。

## 单独开发与验证

```powershell
npm install
npm run dev
npm run verify
```

单独启动可用于界面和本地 Demo 开发；完整 GPT 能力依赖 AI Hub 与共享项目运行时。

## 主要文件

- `src/App.tsx`：统一 Hub 提示、输入工作台和品牌包结果。
- `src/shared/contracts.ts`：只接受 `openai`/`demo` 与 `gpt-*` 的契约。
- `server/providerGateway.ts`：统一 Hub Chat 调用和结构化输出校验。
- `server/demoBrandPack.ts`：实时模型不可用时的完整可视化兜底。
- `server/prompt.ts`：品牌策略与落地页生成提示词。
