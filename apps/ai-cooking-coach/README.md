# AI 备餐教练

AI 备餐教练是 AI Hub 中的中式家庭备餐助手。它可以生成一周健康餐单、采购清单和批量备餐步骤，并提供每日执行、临时换餐和周复盘功能。

## 统一模型与 Key 规则

- API Key 只在 AI Hub 的“API 配置”页面保存一次，项目内不再填写或保存 Key。
- 所有模型请求都通过 AI Hub 的项目级代理发送，不直连 DeepSeek、Gemini、Claude、OpenRouter 或其他厂商接口。
- 项目顶部的统一模型选择器只展示当前 Routing Key 可用的 `gpt-*` 型号。
- 每个项目可以独立选择 GPT 型号；未手动选择时使用 Hub 的默认型号。
- Hub 暂不可用时，备餐计划、换餐和周复盘会返回本地兜底结果，页面不会空白。

## 在 AI Hub 中使用

1. 从 AI Hub 根目录启动完整套件。
2. 打开 Hub 首页，进入“API 配置”。
3. 填写 AI Routing Base URL 和 API Key，保存后执行连接测试。
4. 返回 Hub，打开“AI 备餐教练”。
5. 在页面顶部选择本项目使用的 GPT 型号，然后填写家庭人数、目标、预算和忌口等信息并生成计划。

项目页面不会要求再次输入 API Key。

## 单独开发

本项目自身没有第三方 npm 运行依赖，需要 Node.js 20 或更高版本：

```powershell
npm start
```

默认地址：`http://127.0.0.1:4317`

实时 AI 功能依赖同机运行的 AI Hub，默认调用：

```text
http://127.0.0.1:4194/hub/api/v1/chat/completions
```

如需覆盖地址，可设置 `HUB_CHAT_COMPLETIONS_URL` 和 `HUB_MODEL_CONFIG_URL`。不要把真实 Key 写入本项目的环境变量或源码。

## 验证

```powershell
npm test
node --test --test-isolation=none tests/*.test.mjs
```

`npm test` 验证统一模型路由契约；完整 Node 测试覆盖服务端接口、静态页面、RAG、计划执行和周复盘。

## 本地数据

- 食材营养 RAG：`public/data/ingredient-nutrition-rag.json`
- 菜谱 RAG：`public/data/menu-library-rag.json`
- 菜谱数量：500
- 菜谱重建脚本：`scripts/build_menu_library_rag_from_docx.py`

这些运行数据已纳入仓库，新用户克隆后不需要额外生成。

## API 路由

- `GET /api/health`：健康检查。
- `GET /api/providers`：只返回 Hub 提供的 GPT 型号状态。
- `GET /api/agent`：返回 Hub 托管的备餐智能体信息。
- `POST /api/plan`：生成并规范化一周备餐计划。
- `POST /api/adjust-meal`：生成临时替代餐或本地兜底结果。
- `POST /api/review-week`：生成周复盘和下周建议。

## 限制

- 营养和热量数据仅为估算，不能替代医生或营养师建议。
- 计划历史、执行状态和反馈保存在浏览器本地，不会跨设备同步。
- 实时 AI 能力取决于 AI Hub 中配置的 Routing Key、可用型号和额度。
