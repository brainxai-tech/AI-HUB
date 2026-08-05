# AI 平行宇宙日报

输入今天完成的一件事、目标和情绪，生成坚持、放弃和走偏三条平行时间线的日报，并给出明日行动建议。

## Hub 统一模型

- API Key 只在 AI Hub 配置一次，本项目不会显示、接收或保存 API Key。
- 所有真实模型请求都通过 Hub 项目级代理发送。
- 本项目只展示和接受 Hub 启用的 `gpt-*` 型号。
- 型号通过页面顶部的统一模型选择器切换，项目内部不再提供厂商或模型下拉框。

## 源码恢复状态

服务器只保留了可运行的 `dist/`、`dist-server/`、包元数据和验证测试，原始 TypeScript / React 源码尚未恢复。详见 [SOURCE-RECOVERY.md](./SOURCE-RECOVERY.md)。

## 本地运行与验证

```powershell
npm install
npm start
npm run verify
```
