# 塔罗圣殿

一个三牌阵塔罗反思工具，支持关系、事业与财富问题。当前版本由本地代码完成抽牌和牌阵结构生成，并通过 AI Project Hub 统一模型网关生成中文塔罗测评报告。

## 启动

```bash
npm install
npm run dev:detached
```

或者双击：

```text
start-ai-tarot-sanctum.cmd
```

启动脚本会优先复用已经运行的本地服务，默认打开浏览器，并写入 `dev-server.out.log`、`dev-server.err.log`、`dev-server.pid` 和 `dev-server.port`。如果只启动服务、不自动打开浏览器：

```cmd
set NO_OPEN=1
start-ai-tarot-sanctum.cmd
```

## 验证

```bash
npm run verify
```

## 说明

- 页面不再要求用户填写项目级 API Key；生成测评报告时由本项目的 API route 调用 AI Project Hub 统一模型网关。
- 模型供应商、模型名和密钥统一在 Hub 的模型设置中维护，项目侧只保留 Hub gateway 调用。
- 旧版浏览器 localStorage 中保存过的兼容 API 配置会在进入页面时自动清理。
- 抽牌、78 张牌库、三牌位和正逆位选择都由本地代码完成。
- Hub 模型网关只负责把已抽好的牌阵生成“明确回答、为什么、怎么做、支持/阻力信号、改判条件”等中文报告。
- 不需要用户账号、远程数据库或云同步；解读历史只保存在当前浏览器的 localStorage。
- 项目仍保留本地规则解读引擎，主要用于测试、历史兼容和未来 fallback，但当前主流程要求 Hub 模型网关可用。
- 前端主用 `/api/compatible-reading`；旧的 `/api/deepseek-reading` 仍作为兼容别名保留，两者都走 Hub 模型网关。
