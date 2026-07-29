# AI Cooking Coach Design Spec

## Product Brief

**Working name:** 轻食备餐教练

**Audience:** 健康饮食减肥人群和需要安排家庭一周备餐的人。第一版默认中文用户，面向本地个人工具，而不是公开 SaaS。

**Core promise:** 用户填入减脂目标、家庭人数、预算、忌口、厨房时间和 DeepSeek API Key 后，产品生成一份可执行的一周家庭备餐计划：每日餐单、热量/蛋白估算、批量备餐节奏、采购清单和每道菜的做法。

**MVP scope:**
- 用户自带 DeepSeek API Key。
- API Key 只保存在浏览器 `localStorage`，提交规划时随请求发给本地后端代理，后端不落盘。
- 支持生成 7 天计划、3 天快速计划、目标热量、家庭成员数、口味、忌口、预算、备餐时长、厨房设备。
- DeepSeek 返回结构化 JSON；如果模型返回包裹文本，后端尝试提取 JSON。
- 无 API Key 时提供本地演示计划，便于体验界面。
- 结果页展示每日餐单、营养估算、购物清单、批量备餐流程、风险提醒和可复制 Markdown。

**Non-goals:**
- 不做账号系统、支付、云端保存、营养数据库精准查询。
- 不做医疗建议、疾病饮食处方或处方级减重计划。
- 不做移动端原生 App。
- 不存储用户 API Key 到服务端文件或数据库。

## Market Grounding

Eat This Much 强调按饮食偏好、预算、时间生成个性化餐单、营养目标和购物清单。Mealime 强调个性化备餐、减少浪费、购物清单和营养信息。MyFitnessPal 正在把 AI 营养助手接入计划与餐食建议。Samsung Food 支持周计划、购物清单、营养推荐和家庭成员偏好。

这些产品验证了“健康目标 + 周计划 + 购物清单”的需求，但第一版差异点是：用户自带 DeepSeek API、中文家庭餐语境、备餐步骤可执行、API Key 本地保存。

Sources checked on 2026-06-02:
- DeepSeek chat completions docs: `https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/`
- Eat This Much: `https://www.eatthismuch.com/`
- Mealime getting started guide: `https://support.mealime.com/article/151-getting-started-guide`
- MyFitnessPal Nutrition Coach: `https://support.myfitnesspal.com/hc/en-us/articles/45212266254221-Introducing-Nutrition-Coach-Your-Nutrition-Assistant`
- Samsung Food Meal Planner: `https://support.samsungfood.com/hc/en-us/articles/35369657798548-Getting-Started-with-Meal-Planner`

## UX Design

The first screen is the product workspace, not a landing page. It has three zones:

1. **Plan Input:** DeepSeek connection, family profile, calorie target, weekly days, cuisine preference, dislikes, allergies, budget, prep time, equipment, and pantry inventory.
2. **AI Output:** Generated weekly grid with meals, calories, protein, leftovers, cooking time, and instructions.
3. **Execution Tools:** Grouped grocery list, batch-cook timeline, nutrition guardrails, and export/copy actions.

Visual direction: refined kitchen operations board. Use a calm off-white work surface, dark ink text, tomato and leafy green accents, measured cards, and dense but readable planning controls. No hero marketing layout.

## Technical Architecture

Use a dependency-light local Node app:

- `server.mjs`: built-in HTTP server, static file serving, `/api/health`, `/api/plan`.
- `src/domain/prompt-builder.mjs`: converts user profile into a strict Chinese planning prompt.
- `src/domain/plan-schema.mjs`: validates and normalizes AI meal plans.
- `src/server/deepseek-client.mjs`: builds DeepSeek chat completion requests, calls DeepSeek with injected `fetch`, parses model output.
- `src/server/demo-plan.mjs`: deterministic no-key plan for local demo mode.
- `public/index.html`, `public/styles.css`, `public/app.js`: frontend workspace.
- `tests/*.test.mjs`: Node test runner tests for prompt, schema, DeepSeek parsing, and server behavior.

## DeepSeek Integration

Use the OpenAI-compatible DeepSeek chat completions endpoint:

- URL: `https://api.deepseek.com/chat/completions`
- Preferred model default: `deepseek-v4-flash`
- Alternate: `deepseek-v4-pro`
- `response_format: { "type": "json_object" }`
- `thinking: { "type": "disabled" }` for faster structured planning

The server receives `{ apiKey, model, profile }`, sends the key only in the outbound `Authorization: Bearer ...` header, and never writes it to storage.

## Error Handling

- Missing API Key: return demo plan with `mode: "demo"`.
- Invalid form fields: return HTTP 400 with field-level messages.
- DeepSeek 401/403: tell user the API Key is invalid or lacks access.
- DeepSeek rate limit/server error: preserve form state, show retry guidance.
- Invalid model JSON: return a clear error and show the raw first 600 characters for debugging.

## Verification Plan

- Unit tests for prompt construction, profile validation, AI JSON extraction, plan normalization, and API request shape.
- Server route tests using injected mock fetch and random local port.
- Manual browser verification on desktop-width and mobile-width viewports after the local server runs.
- Verify API Key stays in localStorage and no server-side key file is created.
