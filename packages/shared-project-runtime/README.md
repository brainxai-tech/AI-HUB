# Shared Project Runtime

该进程把非游戏项目的同源 `/api` 请求统一接入 AI HUB 模型网关。项目浏览器代码不会接触 API Key；运行时使用首次启动时生成的项目级内部口令调用根目录 HUB。

服务器历史版本中的适配器包含 `/home/admin/apps/...` 导入路径。运行时在模块解析阶段把这些旧路径映射到仓库的 `apps/`，因此同一份代码可以在 Windows、Linux 和容器中运行。
