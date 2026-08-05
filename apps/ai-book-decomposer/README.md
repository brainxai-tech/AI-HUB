# AI 读书拆解器

一个本地 Web App：用户输入书名、目录、摘录或读书笔记，接入自己的大模型 API Key 后，生成章节地图、核心观点、行动清单和反方观点。

## 功能

- 支持 DeepSeek、GPT / OpenAI、Claude / Anthropic、Gemini / Google。
- API Key 必填后才允许生成。
- API Key 默认不落盘；勾选后仅保存在本次浏览器会话的 `sessionStorage`。
- 支持自定义模型名，避免供应商更新模型后被下拉列表卡住。
- 书名模式会标注资料边界，提示不要伪造章节摘要。
- 摘录、目录、笔记模式会基于用户提供材料拆解。
- 结果可复制或下载为 Markdown，适合放进 Obsidian。

## 运行

```powershell
npm start
```

默认地址：

```text
http://127.0.0.1:4178
```

也可以双击：

```text
start-ai-book-decomposer.cmd
```

## 验证

```powershell
npm run verify
```

验证内容：

- Node 语法检查。
- 供应商请求适配测试。
- 资料边界和提示词测试。
- 服务端 API 测试。

## 安全边界

- 服务端不打印请求体和 API Key。
- `.gitignore` 已排除 `.env`、`.env.local`、密钥文件和 `node_modules`。
- 前端动态内容使用 `textContent` 渲染，避免把用户输入当 HTML。
- 模型调用通过本地服务端代理，避免浏览器直接跨域请求供应商 API。

## 官方 API 参考

- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses/create
- DeepSeek API: https://api-docs.deepseek.com/
- Anthropic Messages API: https://docs.anthropic.com/en/api/messages
- Gemini Generate Content API: https://ai.google.dev/api/generate-content
