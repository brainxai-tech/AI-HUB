# Shared Project Runtime

该进程在本地统一承载 27 个共享非游戏项目：

- 为 Vite 与 Node/static 项目提供构建后页面；
- 为 Next.js 项目加载各自的生产构建；
- 把项目同源 `/api` 请求适配到 Hub 项目级代理；
- 使用首次启动时生成的项目级内部口令调用根目录 Hub，浏览器不接触口令或用户 API Key。

默认端口为 `4195`。完整本地体验由仓库根目录 `scripts/local-suite.mjs` 启动；直接调试可运行：

```powershell
npm test
npm start
```

服务器历史版本中的适配器包含 `/home/admin/apps/...` 导入路径。运行时在模块解析阶段把这些旧路径映射到当前仓库 `apps/`，因此同一份代码可在 Windows、Linux 和容器中运行。
