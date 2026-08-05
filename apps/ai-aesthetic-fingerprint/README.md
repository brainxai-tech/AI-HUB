# AI 审美指纹

上传 1–10 张网页、海报或截图后，生成审美 DNA、审美禁忌、下一版设计方向和可复制的 UI prompt。

## AI Hub 统一模式

- API Key 只在 AI Hub 的“API 配置”页面保存一次，本项目内不填写或保存 Key。
- 页面顶部的统一模型选择器只展示 Routing Key 可用的 `gpt-*` 型号。
- 图片先在本地提取颜色、亮度、对比度、尺寸和构图指标，再通过 AI Hub 的项目级代理让所选 GPT 型号生成结构化报告。
- 不直连 OpenAI、DeepSeek、Gemini、Claude、Anthropic 或 OpenRouter 厂商接口。
- AI Hub 暂不可用时，自动使用本地像素指标生成演示报告，不会出现空白结果。

## 使用方法

1. 从仓库根目录启动完整 AI Hub 套件。
2. 在 Hub 的“API 配置”中填写 AI Routing Base URL 和 API Key，并测试连接。
3. 从 Hub 首页打开“AI 审美指纹”。
4. 在页面顶部为本项目选择一个 GPT 型号。
5. 上传参考图、填写下一版目标并生成报告。

项目页面不会再次要求 API Key，也不会显示厂商选择器。

## 功能

- 支持 JPEG、PNG、WebP，单张不超过 5MB。
- 输出审美摘要、色彩、排版、布局、情绪标签和设计禁忌。
- 提供逐图观察、下一版方向和英文 UI prompt。
- 图片不在项目服务端持久化。
- 模型输出通过 Zod 校验，保证前端获得稳定结构。

## 单独开发

```powershell
npm install
npm run dev
```

默认地址：`http://127.0.0.1:8789`

单独启动只提供本地演示分析；实时 GPT 报告由仓库中的共享项目运行时提供，因此完整体验请从 AI Hub 启动。

## 验证

```powershell
npm run typecheck
npm run test
npm run build
```

## API

- `GET /api/health`：健康检查。
- `GET /api/providers`：返回统一的 GPT/AI Routing 状态和本地演示状态。
- `POST /api/analyze`：分析上传图片并返回结构化审美报告。

请求中的 `provider` 只允许 `openai` 或 `demo`；实际 GPT 型号由 Hub 中本项目的模型选择决定。

## 隐私与边界

- 本地服务不持久化原图。
- AI Hub 模式只把提取后的像素统计和文件名交给文本模型，不把原图直接发送给模型厂商。
- 审美报告用于设计方向探索，最终决策仍应结合品牌目标和可用性测试。
