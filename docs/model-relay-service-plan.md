# 模型中转商服务实施方案

## 目标

把 AI HUB 的“模型中转商服务”从占位页升级为一个可扩展的中转站目录、服务详情和用户控制台。方案分阶段交付：先完成真实可用的公开信息展示，再接入账户、API Key、计量和充值，避免把未接入的付款或开 Key 流程做成假功能。

## 当前基础与约束

- `public/index.html` 已有“模型中转商服务”导航项和空白页。
- `server.mjs` 当前只有管理员 `HUB_ADMIN_TOKEN`、项目级令牌和 AI Routing 上游配置。
- 配置使用原子 JSON 文件存储；当前没有普通用户账户、会话、余额账本、支付回调或按用户计量。
- `/api/v1/chat/completions` 目前按项目令牌授权，不能直接改成普通用户 API Key，否则会破坏现有项目运行时。
- 价格、速度、稳定性和充值状态必须来自可核验的中转商资料，不应在前端硬编码未经确认的承诺。

## 推荐的交付阶段

### 阶段 1：中转站目录与详情（先做）

**公开目录**

- 入口：`/hub/#provider-service`。
- 卡片字段：平台名称、支持模型、价格摘要、服务状态、速度/稳定性、是否支持充值、最后核验时间。
- 状态使用明确枚举：`已接入`、`可试用`、`维护中`、`待核验`，不把“待核验”显示成可用。
- “立即获取 API”根据平台状态跳转到详情页；未接入平台显示“登记意向/即将开放”，不伪造开通成功。

### 用户实际使用路径（第一阶段已落地）

1. 在“模型中转商服务”中选择要使用的模型。
2. 在“按模型比价”表查看各平台的倍率、输入/输出价格、速度和稳定性。
3. 点击“查看”进入平台详情，核对来源、最后核验时间、并发限制和 API 文档。
4. 已接入平台按其公开流程开通；当前 Hub 通道跳转到 Hub API Key 配置页；待核验平台不会显示可用开通入口。

价格倍率通过每个平台的 `modelOffers` 维护，必须同时提供倍率、来源 URL 和核验日期才会标记为“已核验”。缺少这些字段时只展示“待核验”，不填充猜测数字。

**详情页**

- 路由：`/hub/provider-service/?id=<provider-id>`，保留从左侧菜单返回目录的能力。
- 展示支持模型、价格套餐、公开 API 地址、调用示例、并发限制、使用说明、核验时间和服务边界。
- API 地址只展示公开基础地址，绝不返回平台密钥、管理员令牌或内部配置。
- 调用示例默认使用占位环境变量，例如 `${"PROVIDER_API_KEY"}`，避免用户复制到真实仓库时泄露密钥。

**数据接口**

- `GET /api/provider-relays`：公开、只返回已脱敏目录数据，支持 `status`、`model`、`pageSize`。
- `GET /api/provider-model-prices`：公开返回模型价格倍率比较数据和可选模型列表。
- `GET /api/provider-relays/:id`：公开详情。
- `PUT /api/admin/provider-relays`：管理员维护目录、价格说明和核验时间。
- 所有错误统一返回 `{ error: { code, message, details? } }`。

### 阶段 2：用户控制台（账户与 Key，MVP 已接入）

只有在确定数据库和登录方式后实施真实功能：

- `/hub/relay-console/`：登录后查看 Key、余额、用量和消费记录；充值通道尚未配置。
- 账户接口：注册、登录、退出、当前用户信息；使用 HttpOnly、SameSite 会话 Cookie 和 CSRF 防护。
- Key 接口：新建、删除、重置；服务端只保存 Key 哈希和前缀，完整 Key 只在创建/重置时显示一次。
- 用户 Key 与现有项目令牌分离，不能让用户 Key 直接冒充项目令牌访问内部工具。
- 文档页展示 OpenAI 兼容地址、模型名、限流和错误码。

### 阶段 3：余额、充值和真实计量

- 余额使用整数最小货币单位，不使用浮点数。
- 增加不可变账本：充值、退款、消费、人工调整均为独立交易，支付回调按订单号幂等处理。
- 网关记录上游返回的 token usage、模型、单价、请求耗时和结果状态，生成用量明细。
- 请求前检查余额、模型权限、并发和速率；请求后按实际 usage 扣费，失败请求按规则释放或退款。
- 充值按钮在支付渠道和回调验签完成前只能创建“待支付订单”，不能直接增加余额。

## 推荐接口草案

```text
GET    /api/provider-relays
GET    /api/provider-relays/:id

POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/me/keys
POST   /api/me/keys
DELETE /api/me/keys/:id
POST   /api/me/keys/:id/reset
GET    /api/me/balance
GET    /api/me/usage?page=1&pageSize=20
GET    /api/me/transactions?page=1&pageSize=20
POST   /api/me/recharge

PUT    /api/admin/provider-relays
POST   /api/admin/provider-relays/:id/health-check
```

MVP 已实现的商业 API：`/api/relay-auth/*`、`/api/relay-keys`、`/api/relay-wallet`、`/api/relay-pricing`、`/api/relay/v1/chat/completions`；管理员测试额度使用 `/api/admin/relay-wallet/grant`，不代表已接入真实支付。

## 文件边界建议

阶段 1 预计涉及：

- `public/index.html`、`public/app.js`、`public/styles.css`
- `public/provider-relays.js` 或服务端目录数据模块
- `modelOffers`：`model`、`multiplier`、`inputPrice`、`outputPrice`、`currency`、`unit`、`sourceUrl`、`lastVerifiedAt`、`status`
- `server.mjs`
- `tests/provider-relay.test.mjs`、`tests/project-hub-ui.test.mjs`

当前 MVP 使用受限的文件账本完成注册、登录、Key、管理员测试额度和按 usage 扣费；生产环境仍需迁移数据库并接入支付回调。

## 验收标准

### 阶段 1

- 三个板块导航不变，左侧菜单可进入中转站目录。
- 目录卡片和详情字段完整，移动端可用。
- 待核验/维护平台不会显示为“可立即开通”。
- 公开响应不包含任何 API Key、管理员令牌或内部上游凭据。
- `npm test`、`npm run verify` 和浏览器桌面/移动端检查全部通过。

### 阶段 2/3

- 账户、Key、会话和余额均有服务端授权测试。
- Key 只显示一次，日志和错误响应不出现完整 Key。
- 充值回调重复提交不会重复加余额。
- 用量、扣费和退款可以按订单/请求追溯。

## 主要风险

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| 中转商价格或状态过期 | 用户误判成本/可用性 | 保存 `lastVerifiedAt`，过期标为待核验 |
| 没有支付回调却显示充值成功 | 账务损失 | 先做待支付订单，验签后入账 |
| 用户 Key 泄露 | 资金和额度损失 | 只存哈希、一次性显示、支持重置 |
| 用户 Key 冒充项目令牌 | 越权调用内部项目 | 两套凭据和授权器完全分离 |
| 上游没有 usage 字段 | 无法准确扣费 | 未确认计量前不开放按量充值 |
| 中转服务合规/合同不明确 | 运营和法律风险 | 先做目录展示，接入前核验授权和条款 |

## 需要确认的关键事项

1. 第一批要展示哪些真实中转站？请提供名称、公开地址、模型、价格来源和是否已签约/授权。
2. 用户登录准备使用邮箱验证码、手机号验证码，还是账号密码？目前服务器没有邮件/短信服务。
3. 充值准备接入哪一种支付渠道？没有支付渠道前只能做“待支付”演示。
4. 目标是“只做中转站目录”，还是由 AI HUB 自己统一发放 API Key 并承担余额/计费？后者需要数据库和计量改造。

## 建议的下一步

先使用模型优先的目录流程选择模型和代理商；需要调用统一 Relay API 时进入 `/hub/relay-console/`。真实第三方资料、上游授权、支付和退款方案确定后，再开放生产计费。
