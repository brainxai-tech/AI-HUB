# AI 人生版本控制器

像 Git 一样管理人生选择的 AI Web app：当前分支、候选分支、冲突、回滚点、diff、reflog 和下一次 commit。

## 功能

- Life Repo 初始化：记录当前状态、选择、价值观、约束、资源和时间窗口。
- Branch Graph：生成 `main`、`feature/*`、`hotfix/*` 等人生分支。
- Diff Viewer：对比当前路线与候选路线的代价、收益、可逆性和行动密度。
- Conflict Resolver：把模糊焦虑翻译成可处理的冲突，并支持 current / incoming / manual merge。
- Next Commit：把 AI 输出落到 30-90 分钟内能做的小行动。
- Reflog：保存选择、行动、复盘和 rollback note。
- 通过 AI Hub 项目级代理生成分支、冲突和下一次 commit。
- 导出 Markdown / JSON。

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:5207
```

## Hub 统一模型

- API Key 只在 AI Hub 配置一次，本项目不会显示、接收或保存 API Key。
- 所有真实模型请求都通过 Hub 项目级代理发送。
- 本项目只展示和接受 Hub 启用的 `gpt-*` 型号。
- 型号通过页面顶部的统一模型选择器切换，项目内部不再提供厂商或模型下拉框。

## 验证

```bash
npm run verify
```

该命令会运行类型检查、Vitest 和生产构建。
