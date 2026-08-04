# AI 课程教学助手

面向教师和培训师的教学包工作台，可生成讲义、测验、错题解析、教学活动，以及 Word、PPT 和思维导图格式草稿。

## Hub 统一模型

- API Key 只在 AI Hub 配置一次，本项目不会显示、接收或保存 API Key。
- 所有真实模型请求都通过 Hub 项目级代理发送。
- 本项目只展示和接受 Hub 启用的 `gpt-*` 型号。
- 型号通过页面顶部的统一模型选择器切换，项目内部不再提供厂商或模型下拉框。
- Hub 尚未配置时会明确阻止真实生成，不会绕过 Hub 直连外部厂商。

共享运行时注入以下项目级配置，用户无需手工填写：

```bash
HUB_MODEL_CONFIG_URL=
HUB_CHAT_COMPLETIONS_URL=
HUB_PROJECT_TOKEN=
HUB_COURSE_REQUEST_TIMEOUT_MS=160000
NEXT_PUBLIC_BASE_PATH=
```

大型教学包使用独立的超时预算：Hub 网关默认 150 秒，本项目请求默认 160 秒，Agent 工作流客户端默认 170 秒。可分别通过 `HUB_COURSE_UPSTREAM_TIMEOUT_MS`、`HUB_COURSE_REQUEST_TIMEOUT_MS` 和 `AIHUB_COURSE_TIMEOUT_MS` 覆盖；外层预算应始终大于内层预算。

## 本地运行

从仓库根目录按统一启动说明运行，或在本目录执行：

```bash
npm install
npm run dev
```

## 验证

```bash
npm run verify
```
