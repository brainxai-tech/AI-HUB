# Spec: AI 数据分析师 MVP

## 目标

构建一个本地优先的 Web 应用，让业务用户上传 CSV 或 Excel 文件后，自动获得图表、数据质量检查、异常点、洞察和下一步建议，并可从 AI HUB 已启用的 `gpt-*` 型号中选择模型，把结构化分析结果生成中文叙述报告。

## 技术栈

- Next.js + React + TypeScript：应用界面与 API route。
- Papaparse：CSV 解析。
- read-excel-file：XLSX 解析。
- Recharts：图表渲染。
- zod：API 边界校验。
- Vitest：确定性分析逻辑测试。

## 命令

- Dev：`npm run dev`
- Test：`npm run test`
- Typecheck：`npm run typecheck`
- Build：`npm run build`
- Verify：`npm run verify`

## 项目结构

- `app/` -> Next app 路由与全局样式。
- `app/api/llm/route.ts` -> AI HUB 统一路由代理。
- `src/lib/` -> 数据画像、异常检测、图表推荐、LLM 分析摘要。
- `src/components/` -> 上传、设置、仪表盘、图表和报告 UI。
- `tests/` -> 确定性分析逻辑单元测试。
- `docs/` -> 规格和实现说明。

## 边界

- Always：数值计算必须确定性且有测试覆盖；API 输入必须校验；不得记录 API Key 或完整上传数据。
- Ask first：持久化数据库、登录鉴权、付费 provider SDK、部署凭证。
- Never：提交密钥、默认把完整原始数据发给模型、把模型输出作为数值真相来源。

## 验收标准

- 用户可以上传 `.csv` 或 `.xlsx` 并看到数据预览。
- 应用能推断字段类型，并计算缺失率、唯一值、分布、摘要统计、相关性和异常点。
- 应用能根据字段结构推荐并渲染可用图表。
- 应用无需 LLM 即可生成确定性洞察和下一步建议。
- 用户可以通过页面顶部统一选择器选择 AI HUB 已启用的 `gpt-*` 型号，并通过 API route 提交结构化摘要生成中文报告。
- API Key 只由 AI HUB 统一管理，本项目不会接收或持久化密钥。
- 测试和构建通过。

## 待确认问题

- 第一版之后是否需要持久化分析项目。
- 首个垂直场景优先做电商、广告、财务、运营还是研究分析。
