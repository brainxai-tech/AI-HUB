# 青青草原型人格测试器

轻松、治愈、有梗但计分稳定的人格测试网页小工具。用户可以选择 30 题专业版或 15 题体验版，系统根据五个维度归一化分数匹配 20 种原创草原意象人格。

线上地址：https://qingqing-grassland-personality.vercel.app

## 功能

- 首页自由选择专业版或体验版
- 五档量表答题：非常不同意、不同意、一般、同意、非常同意
- 五维计分与按当前题组归一化
- 最近锚点匹配 20 种人格
- 结果页展示人格名、关键词、核心描述、优势、盲点、相处建议
- 支持重新测试
- 生成可复制的分享文案

## 测试维度

| 维度 | 负向 | 正向 |
| --- | --- | --- |
| SE 社交能量 | 独处蓄电 | 群体发光 |
| AC 行动方式 | 稳扎稳打 | 灵感冲刺 |
| RB 关系策略 | 照顾融合 | 边界清醒 |
| RV 风险偏好 | 谨慎避坑 | 先冲再说 |
| EE 情绪表达 | 自我消化 | 外放表达 |

## 本地开发

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。本项目也提供 Windows 桌面环境用的独立启动脚本：

```bash
npm run dev:detached
```

独立启动脚本会把端口写入 `dev-server.port`，当前默认使用 `3210`。

## 验证

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

或一次性运行：

```bash
npm run verify
```

## 部署

当前目录已链接到 Vercel 项目 `qingqing-grassland-personality`。

```bash
npx vercel deploy --prod --yes
```

生产地址：

```text
https://qingqing-grassland-personality.vercel.app
```

## 说明

本产品是娱乐型自我理解测试，不是心理诊断工具，也不提供专业心理建议。
