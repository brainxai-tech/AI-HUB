# AI HUB

AI HUB 把 33 个 AI 工具和 5 款游戏放进同一个可复现仓库，并统一提供项目目录、GPT 型号目录、项目级模型代理和本地一键启动。用户从 GitHub 全新克隆后，只需在 Hub 配置一次自己的 AI Routing API Key；各项目页面不接收、保存或显示 API Key。

## 全新克隆与一键启动

需要 Node.js 20 或更高版本，推荐使用 Node.js 24。

```powershell
git clone https://github.com/brainxai-tech/AI-HUB.git
cd AI-HUB
npm run workspace:install
npm run workspace:build
npm run workspace:verify
.\打开本地AI-HUB.cmd
```

也可以在终端中运行：

```powershell
npm run start:suite
```

打开 `http://127.0.0.1:4194/hub/`，再进入 `http://127.0.0.1:4194/hub/key-config/` 配置自己的 AI Routing API Key。Hub 只接受并展示 `gpt-*` 型号，所有模型感知工具和游戏都通过项目级服务端凭证调用 Hub；浏览器中没有供应商 Key、项目令牌或共享令牌。

停止完整套件：

```powershell
.\stop-local-suite.ps1
```

`start-ai-project-hub.cmd` 只启动 Hub 单进程，适合网关调试；完整体验请使用一键套件。

## 本地服务与游戏

完整套件启动 11 个本地进程，并由 Hub 直接托管 2 款静态游戏：

| 服务 | 端口 | 用途 |
|---|---:|---|
| Hub | 4194 | 首页、Key 配置、模型目录、项目代理、Fury Flock、Dice Estate |
| shared-project-runtime | 4195 | 28 个共享运行时工具的页面和 API |
| agent-workflow-runtime | 4196 | Skill 加载、持久化工作流、检查点、重试和项目动作 API |
| AI PPT 汇报教练 | 4201 | 专用工具服务 |
| AI 工作汇报生成器 | 4202 | 专用工具服务 |
| 人格罗盘 · MBTI | 4203 | 专用工具服务 |
| 八百字 AI 作文教练 | 4204 | 专用工具服务 |
| 吟舟 AI 古诗工作台 | 4205 | 专用工具服务 |
| AI 象棋对弈 | 4211 | Next.js 专用游戏服务 |
| AI 国际象棋 | 4212 | Next.js 专用游戏服务 |
| AI 围棋 9 路 | 4213 | Next.js 专用游戏服务 |

用户从 Hub 访问游戏时使用以下稳定地址：

| 游戏 | Hub 地址 | AI / 运行边界 |
|---|---|---|
| AI 象棋对弈 | `http://127.0.0.1:4194/xiangqi/` | Pikafish 对弈，Hub GPT 可选讲解 |
| AI 国际象棋 | `http://127.0.0.1:4194/chess/` | 本地规则 AI，Hub GPT 教练 |
| AI 围棋 9 路 | `http://127.0.0.1:4194/go/` | 本地规则 AI，Hub GPT 教练 |
| Fury Flock | `http://127.0.0.1:4194/fury-flock/` | Phaser / Canvas，本机进度存档 |
| Dice Estate Duel | `http://127.0.0.1:4194/hub/dice-estate/` | Hub GPT Agent，非法或失败响应自动回退本地规则 |

## Pikafish 自动安装

象棋服务首次随完整套件启动时，会自动下载官方固定版本 [`Pikafish-2026-01-02`](https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-01-02)。安装器在解压前校验固定 SHA-256，并在以后启动时重新校验、复用 `.local-runtime/engines/` 中的缓存。仓库不提交压缩包或可执行文件。

自动安装支持：

- Windows x64（优先使用系统 PowerShell 下载、系统 `tar` 解压）
- Linux x64（需要 `7zz`、`7z` 或 `bsdtar`）
- macOS Apple Silicon

高级用户可预先设置 `PIKAFISH_PATH` 指向自己的兼容可执行文件，跳过自动下载。Pikafish 按 [GNU GPL v3](https://github.com/official-pikafish/Pikafish/blob/master/Copying.txt) 发布，固定版本源码见[官方仓库](https://github.com/official-pikafish/Pikafish/tree/Pikafish-2026-01-02)。

## 统一模型规则

```text
项目页面 -> 项目同源 /api -> shared/dedicated runtime -> Hub 项目级代理 -> AI Routing
```

- Hub 只接受和展示 `gpt-*` 型号。
- 每个项目独立继承或保存当前 GPT 型号。
- 浏览器只向项目同源 API 发送业务输入。
- 项目运行时注入项目身份和项目令牌，再调用 Hub。
- 用户 Key 只保存在 Hub 服务端配置中，不回显到公开配置，也不写入源码、日志或构建产物。
- Dice Estate 的模型只能选择服务端给出的合法动作；服务端回填合法参数，失败时自动使用确定性 Agent。

## Agent Skill 与持久化工作流

`agent-workflow-runtime` 在 `127.0.0.1:4196` 加载仓库 `skills/`，把项目原有 API 组合为可恢复的多步骤运行。当前首批覆盖作文、备餐、论文、课程、合同条款复核和 TraceSheet 六个项目，支持检查点、项目动作、失败重试、显式删除、30 天默认保留期、JSON 文件持久化和知识引用元数据。合同工作流是 `model-only`，不声称连接法规知识库；TraceSheet 只向服务端发送文件/工作表/字段/行数元数据，原始行与单元格始终留在浏览器。

本地接口：

- `GET /health`：运行时与 Skill 数量。
- `GET /api/skills`：可加载 Skill 和工作流元数据。
- `POST /api/runs`：以 `{ "skillId": "...", "input": {} }` 启动。
- `GET /api/runs/<run-id>`：读取状态与输出。
- `POST /api/runs/<run-id>/resume`：提交当前检查点输入。
- `POST /api/runs/<run-id>/actions/<action-id>`：执行不覆盖原结果的项目动作，例如临时换餐。
- `POST /api/runs/<run-id>/retry`：重试保留的失败命令。
- `DELETE /api/runs/<run-id>`：删除指定运行及其持久化内容。

服务默认仅监听回环地址，不由生产 Nginx 公开。生产部署在 `/etc/ai-project-hub/agent-workflow.env` 生成独立强随机 `WORKFLOW_API_TOKEN`，Hub 与 workflow unit 同时读取它；浏览器不会收到该令牌。运行数据写入 mode `0700` 的 `/var/lib/ai-project-hub/workflow-runs`，不得进入 release 或日志。

管理员工作流中心位于 `/hub/workflows/`。所有 `/hub/api/workflows/*` 请求先由 Hub 使用 `HUB_ADMIN_TOKEN` 鉴权，再由 Hub 在服务端注入内部 workflow 令牌。生产站点目前只有 HTTP，正式管理操作应通过 SSH 隧道访问，例如：

```bash
ssh -L 14194:127.0.0.1:4194 admin@server
```

随后在本机打开 `http://127.0.0.1:14194/hub/workflows/`。

## 验证

```powershell
npm test
npm run workspace:verify
npm run security:scan
npm run e2e
```

`workspace:verify` 会验证 33 个工具和 4 个带独立依赖的游戏包；Hub 静态游戏 Dice Estate 由根仓库测试覆盖。`e2e` 使用本机模拟上游，不需要真实 Key，并验证 33 个工具路由、业务 API 与统一型号、5 款游戏的浏览器操作、项目身份、浏览器存档和 Fury Flock Canvas 截图。

## 仓库结构

- `apps/<project-id>/`：33 个工具的可构建源码。
- `games/`：象棋、国际象棋、围棋和 Fury Flock 源码。
- `public/dice-estate/`：Dice Estate 的 Hub 静态游戏资源。
- `packages/shared-project-runtime/`：共享页面服务和 API 适配层。
- `packages/agent-workflow-runtime/`：加载仓库 Skill、保存工作流状态并调用现有项目 API。
- `skills/`：作文、备餐、论文、课程、合同复核和 TraceSheet 六个首批 Skill 包；每个包包含 Skill 指令、机器清单、适配器和契约参考。
- `public/`：Hub 首页、Key 配置页、统一选择器和共享视觉资源。
- `deploy/project-manifest.json`：33 个 `projects` 和 5 个 `games` 的唯一运行清单。
- `scripts/local-suite.mjs`：完整套件的进程监督、项目凭证和 Pikafish 准备。
- `SOURCE-RECOVERY.md`：仅有服务器发布产物的项目恢复边界。

不得提交 `.env`、真实 API Key、管理员令牌、项目令牌、SSH 私钥、`node_modules`、`.next`、本地日志、PID、用户数据、备份或下载的引擎文件。

## 生产发布与回滚

生产版本位于 `/opt/ai-project-hub/releases/<commit>`，`/opt/ai-project-hub/current` 只通过原子软链接切换。密钥与运行数据分别保存在 `/etc/ai-project-hub`、`/var/lib/ai-project-hub` 和 `/var/log/ai-project-hub`，不得打入 release。

```bash
commit=$(git rev-parse HEAD)
git archive --format=tar.gz --output="ai-project-hub-$commit.tar.gz" HEAD
scp "ai-project-hub-$commit.tar.gz" admin@server:/home/admin/staging/releases/
sudo /opt/ai-project-hub/current/deploy/deploy.sh \
  "/home/admin/staging/releases/ai-project-hub-$commit.tar.gz" "$commit"
```

如果服务器当前仍使用不认识 workflow unit 的旧版部署脚本，第一次发布需在切换到新 release 后再执行一次新脚本的激活模式：

```bash
sudo /opt/ai-project-hub/current/deploy/deploy.sh --activate "$commit"
```

激活会原子安装 Hub 与 workflow 两个 unit，依次检查 4194、带令牌的回环 4196 和 Nginx 健康状态。任一步失败都会恢复旧 release、两个 unit 及其原启用/运行状态。回滚到不包含 workflow runtime 的旧 release 时会停用 4196。

回滚：

```bash
sudo /opt/ai-project-hub/current/deploy/rollback.sh
sudo /opt/ai-project-hub/current/deploy/rollback.sh <commit>
```
