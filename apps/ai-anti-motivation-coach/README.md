# AI 反鸡汤教练

用户输入一句自我激励、困惑或拖延借口，AI 不灌鸡汤，而是拆解空话、指出现实变量，并给出今天能执行的动作。

## AI Hub 统一模式

- API Key 只在 AI Hub 的“API 配置”页面保存一次，本项目不读取、不填写也不保存 Key。
- 项目只使用 AI Routing 提供的 `gpt-*` 型号，不直连 DeepSeek、Gemini、Claude、Anthropic 或 OpenRouter。
- 每个项目的 GPT 型号可独立选择；切换入口位于页面顶部的统一模型选择器。
- 项目内部不再显示厂商按钮或第二套模型下拉框。
- Hub 暂不可用时会切换到本地预览；危机语言始终进入安全兜底，不使用毒舌语气处理自伤风险。

## 使用方法

1. 从仓库根目录启动完整 AI Hub 套件。
2. 在 Hub 的“API 配置”中填写 AI Routing Base URL 和 API Key，并测试连接。
3. 从 Hub 首页打开“AI 反鸡汤教练”。
4. 在页面顶部选择这个项目使用的 GPT 型号。
5. 选择冷静版、毒舌版或朋友版，输入内容后生成建议。

## 功能

- 三种表达风格：冷静版、毒舌版、朋友版。
- 识别空泛表述，并给出带时长、第一步和完成证据的行动。
- 对模型结果做结构校验和质量评估；过于泛化时自动重写一次。
- 内置危机语言安全模式。
- 实时模型不可用时返回可视化本地结果，页面不会空白。

## 单独开发

```powershell
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5191`

单独启动可以使用本地预览；完整 GPT 能力由仓库中的 Hub 与共享项目运行时提供。

## 验证

```powershell
npm run typecheck
npm run test
npm run build
```

## 技术结构

- `src/App.tsx`：React 主界面和统一 Hub 状态提示。
- `src/shared/contracts.ts`：只允许 `openai`/`demo` 与 `gpt-*` 的前后端共享契约。
- `server/hubModels.ts`：项目级 Hub 模型目录和 GPT 过滤。
- `server/providerGateway.ts`：统一 Hub Chat 请求、输出解析和质量重写。
- `server/safety.ts`：危机语言安全模式。
- `tests/`：契约、质量、提示词和网关测试。
