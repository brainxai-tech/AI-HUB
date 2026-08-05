# AI HUB 源码与运行约定

本仓库的目标是让任何人从 GitHub 全新克隆后，安装、构建并启动 32 个工具和 5 款游戏。用户只在 Hub 配置 AI Routing API Key；工具和游戏浏览器不直接接触 Key 或项目令牌。

## 清单与目录

`deploy/project-manifest.json` 是运行边界的唯一清单：

- `manifest.projects`：32 个工具。
- `manifest.games`：5 款游戏。
- `apps/<project-id>/`：工具源码。
- `games/<game-id>/`：四款独立游戏源码。
- `public/dice-estate/`：Dice Estate Hub 静态资源。
- `packages/shared-project-runtime/`：共享项目 API 和页面服务。
- `public/`：Hub 及其共享静态资源。

不要再维护排除游戏列表；自动化从 `projects` 和 `games` 两组清单共同枚举包、构建、路由和安全扫描范围。

## 运行边界

### 工具

- 27 个项目由 `shared-project-runtime` 在 4195 端口提供页面和 API。
- AI PPT 汇报教练在 4201 端口运行。
- AI 工作汇报生成器在 4202 端口运行。
- 人格罗盘、八百字 AI、吟舟 AI 分别在 4203、4204、4205 端口运行。

### 游戏

- 象棋、国际象棋和围棋分别作为 Next.js 专用服务运行在 4211、4212、4213。
- Fury Flock 构建为 Vite 静态资源，由 Hub 从 `/fury-flock/` 提供。
- Dice Estate 是 Hub 静态游戏，由 `/hub/dice-estate/` 提供，并调用 Hub 自有的 `/api/agent/decision`。

游戏保留各自的规则、模拟、渲染、输入和存档边界。棋盘、Canvas 和沉浸式界面不套用办公工具 CSS；只统一 Hub 入口、凭证说明、模型边界和基础可访问性交互。

## 模型与凭证

```text
浏览器 -> 项目同源 API -> 项目运行时 -> Hub 项目级模型代理 -> AI Routing
```

- 只允许 `provider: openai` 兼容入口和 `gpt-*` 型号。
- Hub 配置保存用户 Routing Key，并按项目返回经过筛选的型号目录。
- 项目令牌只注入服务端子进程；不得写入 HTML、客户端 bundle、浏览器存储或日志。
- 象棋、国际象棋和围棋页面只读显示当前 `Hub GPT`。
- Dice Estate 的 Hub 决策端点限制请求体、Agent profile、合法动作数量和字段形状；模型只能选择合法动作，参数由服务端回填。
- 上游不可用或响应非法时，游戏必须保持可玩并使用本地确定性逻辑。

## 构建与一键套件

```powershell
npm run workspace:install
npm run workspace:build
npm run workspace:verify
npm run start:suite
```

`workspace:install`、`workspace:build` 和 `workspace:verify` 处理 32 个工具及四个包含 `package.json` 的游戏。Dice Estate 没有独立 npm 包，但仍由根测试和安全扫描覆盖。

完整套件负责：

1. 创建本机项目级令牌注册表。
2. 启动 Hub、共享运行时、五个专用工具和三个专用棋类游戏。
3. 向每个子进程只注入自己的项目身份和令牌。
4. 下载、校验并缓存固定 Pikafish；仅象棋进程接收 `PIKAFISH_PATH`。
5. 由 Hub 安全提供 Fury Flock 和 Dice Estate 静态资源。
6. 通过 `suite.stop` 或 `stop-local-suite.ps1` 停止全部子进程。

## 导入与提交规则

每个项目只导入可维护源码、锁文件、测试和必要资源。以下内容不得进入 Git：

- `.env`、真实 API Key、管理员令牌、项目令牌和 SSH 私钥。
- `node_modules`、`.next`、`dist`、`dist-server` 等可重建产物（历史恢复项目明确记录的发布产物除外）。
- 本地运行日志、PID、用户上传、用户生成数据、备份和历史发布包。
- 下载的 Pikafish 压缩包、可执行文件和 `.local-runtime/`。
- 服务器专属绝对路径、线上 IP 或机器私有配置。

项目导入后必须完成依赖安装、单测、类型检查、生产构建、安全扫描、相对路由和浏览器验收。Canvas/WebGL 游戏的浏览器验收必须保存并人工查看代表性截图。

## 发布验收

```powershell
npm test
npm run workspace:verify
npm run security:scan
npm run e2e
```

发布前还要从目标分支创建全新克隆，重复安装、构建、验证和 E2E，并确认 `git status --short` 为空。生产 Nginx 必须保留棋类专用 upstream、Fury 指纹资源长期缓存、游戏 HTML `no-store`，以及 Dice `/api/agent/decision` 到 Hub 4194 的显式代理。
