# SOURCE RECOVERY

## 恢复事实

- 恢复来源：服务器 `/home/admin/apps/ai-ppt-report-coach/current` 解引用后的实际 release。
- 解析到的 release：`/home/admin/apps/ai-ppt-report-coach/releases/20260728T123149Z-hub-key-only`。
- 迁移时逐文件 SHA-256 已与该实际 release 核对，14/14 一致。
- 可重装的 `node_modules` 未迁移；依赖由 `package-lock.json` 恢复。

## 可用源码范围

服务器全部现存 release 与部署暂存区均不包含 `src/`、`server/*.ts`、测试或 sourcemap。当前仓库因此保留可运行的浏览器 bundle、CSS、HTML、可读的 ESM 服务端代码和完整依赖清单，但不能声称恢复了原始 TypeScript/React 源码。

统一化修改直接作用于这份可运行 release：删除用户 Key/直连/演示后备路径，限制 `openai + gpt-*`，并加入可重复的语法、路由与界面静态验证。`npm run build` 会验证恢复产物完整且可执行。
