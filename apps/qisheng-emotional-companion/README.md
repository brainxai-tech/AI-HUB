# 栖声 - 本地 AI 恋爱陪伴

一个零依赖本地 Web app。当前版本从情感陪伴原型升级为 18+ AI 恋爱陪伴 MVP 骨架：6 个虚构角色、原创动漫角色视觉、关系阶段、今日事件、本地记忆、浏览器语音朗读和基础安全边界。

用户必须确认已满 18 岁，并接入自己的模型 API Key 后才能交互。当前支持 DeepSeek、GPT/OpenAI、Gemini 和 Claude。API Key 只保存在本地 Node 进程内存中，不写入 localStorage、聊天记录或文件。

## 运行

推荐直接双击中文入口：

```text
启动栖声.cmd
```

也可以双击英文入口：

```text
start.cmd
```

它会启动本地服务，并在服务就绪后自动打开浏览器。

或者在终端前台运行：

```powershell
npm start
```

打开：

```text
http://127.0.0.1:5179
```

使用时保持终端窗口打开；按 `Ctrl+C` 停止本地服务。如果自动打开失败，也可以手动打开 `http://127.0.0.1:5179`。

## 验证

```powershell
npm run verify
```

验证脚本不会调用外部模型网络接口，也不会要求真实 API Key。它检查静态页面、本地 API 基础状态、安全响应头、无 Key 时的拦截、多供应商配置、SSE 解析、角色兼容和危机文本识别。

## 当前能力

- 18+ 年龄确认与 AI 身份说明。
- 6 个虚构恋爱角色：温柔年上、冷感医生、阳光学弟、霸道老板、毒舌竹马、神秘歌手。
- image2 生成的原创动漫角色视觉墙，登录页、聊天头部和角色选择卡都会展示角色照片。
- 对话区背景会跟随当前角色切换，使用 image2 生成的角色生活场景图，不再复用头像图，并保持原始比例避免拉伸。
- 微信式文字聊天。
- 多供应商模型接入：DeepSeek、GPT/OpenAI、Gemini、Claude。
- 每个角色有独立 system prompt，包含人物定位、语气、互动方式、恋爱表达和安全边界。
- 每个角色拥有独立会话列表，切换角色时不会混看其他角色的聊天记录。
- 浏览器 `speechSynthesis` 语音朗读回复。
- 每个角色独立关系进度和关系阶段。
- 每日恋爱事件入口。
- 结构化本地记忆，支持称呼、偏好、雷区、纪念日、最近事件和关系备注，可编辑、删除，并按当前角色进入 system prompt。
- 本地内测记录摘要，覆盖消息、语音、记忆、每日事件、反馈和风险记录。
- AI 回复反馈入口，支持标记人设不稳、太油腻、语音不合适、记忆错误和安全风险。
- 风险日志与内测数据导出，导出包默认只包含摘要、事件、反馈和风险，不包含完整聊天正文或记忆正文。
- 危机表达本地拦截。
- 未成年人恋爱、真人/公众人物模拟、声音克隆、露骨色情、强迫控制类请求本地拦截。

## 设计边界

- 角色均为 18+ 虚构 AI 角色，不是真人。
- 本项目不是心理治疗、医疗建议、法律建议或紧急救援服务。
- 不做未成年人恋爱内容。
- 不做公众人物、真实个人、前任、同学同事等未授权身份模拟。
- 不做未经授权的声音克隆。
- 不用情绪勒索型话术做留存。
- 聊天记录、角色设置、关系进度和记忆只存在浏览器 localStorage。
- 外部模型接口是无状态接口，所以每次请求都会由本地应用拼接必要历史、记忆和关系状态。

## 模型接入依据

- DeepSeek 使用 OpenAI-compatible `/chat/completions`：
- API base URL 和 `/chat/completions`: https://api-docs.deepseek.com/
- 无状态多轮对话: https://api-docs.deepseek.com/guides/multi_round_chat
- 错误码: https://api-docs.deepseek.com/quick_start/error_codes
- 并发、`user_id` 和 SSE keep-alive: https://api-docs.deepseek.com/quick_start/rate_limit
- Thinking mode 默认开启；本应用日常陪伴请求显式关闭 thinking mode，以便使用温度控制: https://api-docs.deepseek.com/guides/thinking_mode
- GPT/OpenAI 使用 OpenAI Chat Completions API: https://platform.openai.com/docs/api-reference/chat
- Gemini 使用 Gemini OpenAI compatibility endpoint: https://ai.google.dev/gemini-api/docs/openai
- Claude 使用 Anthropic Messages API 和 Messages streaming: https://docs.anthropic.com/en/api/messages

## 项目结构

```text
ai-emotional-companion-local/
  server.mjs              # Node 本地静态服务与多模型代理
  public/
    assets/characters/    # 原创动漫角色视觉资产
    index.html            # 应用入口
    styles.css            # 响应式 UI
    app.js                # 前端状态、角色、关系、记忆、语音朗读和流式聊天
    memory-store.js       # 结构化记忆模型、旧数据迁移和 prompt 摘要
    model-providers.js    # 模型供应商、协议、模型列表和默认值
  scripts/
    smoke-test.mjs        # 本地验证
  start.cmd               # Windows 双击启动并自动打开网页
  run-local.cmd           # 备用前台启动脚本
```

## 后续可做

- 接入质量更稳定、可商用授权的 TTS 服务，替代浏览器语音。
- 用 IndexedDB 替代 localStorage，支持更大的聊天记录和结构化记忆。
- 增加可导入导出的本地加密数据包。
- 增加真实 token 估算和会话摘要压缩。
- 增加付费意愿测试。
