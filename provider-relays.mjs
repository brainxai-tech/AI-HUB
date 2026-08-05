const providerIdPattern = /^[a-z0-9][a-z0-9-]{1,79}$/;
const statuses = new Set(["connected", "trial", "maintenance", "pending"]);
const relayKinds = new Set(["internal", "aggregator", "relay"]);
const priceStatuses = new Set(["verified", "estimated", "pending"]);

const statusLabels = {
  connected: "已接入",
  trial: "可试用",
  maintenance: "维护中",
  pending: "待核验",
};

const priceStatusLabels = {
  verified: "已核验",
  estimated: "估算",
  pending: "待核验",
};

export const DEFAULT_PROVIDER_RELAY_ID = "ai-routing-current";

const routingModels = ["gpt-5.4", "gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra"];

const pendingRoutingOffers = routingModels.map((model) => ({
  model,
  status: "pending",
  multiplier: null,
  inputPrice: null,
  outputPrice: null,
  currency: "",
  unit: "待核验",
  billing: "按上游账户实际价格为准",
  notes: "当前仅用于 AI HUB 内部项目调用，普通用户余额计费尚未开放。",
  sourceUrl: "",
  lastVerifiedAt: "",
}));

const defaultProviderRelays = [
  {
    id: DEFAULT_PROVIDER_RELAY_ID,
    name: "AI Routing（当前 Hub 通道）",
    kind: "internal",
    summary: "AI HUB 当前使用的 OpenAI 兼容通道，先展示接入边界和模型能力。",
    models: ["GPT 系列", ...routingModels],
    modelOffers: pendingRoutingOffers,
    pricing: {
      summary: "按上游账户实际价格为准",
      unit: "未接入用户余额计费",
      plans: [],
    },
    status: "pending",
    speed: { label: "待监测", detail: "尚未建立公开延迟探针" },
    stability: { label: "待核验", detail: "当前仅用于 Hub 项目级调用" },
    supportsRecharge: false,
    apiBaseUrl: "/api/v1",
    runtimeProviderId: "routing",
    concurrency: "沿用当前项目级并发限制",
    usage: "适用于 AI HUB 内部项目；普通用户 API Key 尚未开放。",
    docs: "先配置 Hub API Key，再由具体项目通过同源网关调用。",
    lastVerifiedAt: "2026-08-05",
    featured: true,
  },
  {
    id: "external-relay-pending",
    name: "第三方中转站接入位",
    kind: "relay",
    summary: "用于承载后续已核验的第三方中转站资料，当前不代表任何已签约平台。",
    models: ["待补充平台资料"],
    modelOffers: [],
    pricing: {
      summary: "等待核验公开价格",
      unit: "暂不支持购买",
      plans: [],
    },
    status: "pending",
    speed: { label: "待监测", detail: "接入后建立延迟和成功率监测" },
    stability: { label: "待核验", detail: "请先确认平台授权、服务条款和 SLA" },
    supportsRecharge: false,
    apiBaseUrl: "",
    concurrency: "接入后按平台条款填写",
    usage: "资料完成核验前，不提供注册、充值或 API Key。",
    docs: "请联系管理员提交平台名称、模型、价格、公开 API 文档和授权信息。",
    lastVerifiedAt: "",
    featured: false,
  },
];

function boundedString(value, maximum, fallback = "") {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  if (!next || next.length > maximum || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

function safeUrl(value, { allowRelative = false } = {}) {
  const next = boundedString(value, 500);
  if (!next) return "";
  if (allowRelative && next.startsWith("/")) return next;
  try {
    const url = new URL(next);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.toString().replace(/\/$/, "")
      : "";
  } catch {
    return "";
  }
}

function normalizeList(value, maximum = 24) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => boundedString(item, 120)).filter(Boolean)),
  ).slice(0, maximum);
}

function normalizeMetric(value, fallbackLabel) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    label: boundedString(raw.label, 80, fallbackLabel),
    detail: boundedString(raw.detail, 240, "暂无说明"),
  };
}

function normalizeNonNegativeNumber(value, maximum) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) return null;
  return Number(number.toFixed(6));
}

function normalizeModelOffers(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 120).flatMap((offer) => {
    if (!offer || typeof offer !== "object") return [];
    const model = boundedString(offer.model, 120);
    if (!model) return [];
    const status = priceStatuses.has(offer.status) ? offer.status : "pending";
    const multiplier = normalizeNonNegativeNumber(offer.multiplier, 1000);
    const inputPrice = normalizeNonNegativeNumber(offer.inputPrice, 1_000_000);
    const outputPrice = normalizeNonNegativeNumber(offer.outputPrice, 1_000_000);
    const lastVerifiedAt = /^\d{4}-\d{2}-\d{2}$/.test(offer.lastVerifiedAt || "")
      ? offer.lastVerifiedAt
      : "";
    const verifiedStatus = ["verified", "estimated"].includes(status) && multiplier === null
      ? "pending"
      : status === "verified" && !lastVerifiedAt
        ? "pending"
        : status;
    return [{
      model,
      label: boundedString(offer.label, 120, model),
      status: verifiedStatus,
      statusLabel: priceStatusLabels[verifiedStatus],
      multiplier: verifiedStatus === "pending" ? null : multiplier,
      inputPrice,
      outputPrice,
      currency: boundedString(offer.currency, 12),
      unit: boundedString(offer.unit, 80, "按平台计费单位"),
      billing: boundedString(offer.billing, 180, "按平台公开计费规则为准"),
      notes: boundedString(offer.notes, 360, "暂无价格说明"),
      sourceUrl: safeUrl(offer.sourceUrl),
      lastVerifiedAt,
    }];
  });
}

function normalizePlans(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((plan) => {
    if (!plan || typeof plan !== "object") return [];
    const name = boundedString(plan.name, 80);
    const price = boundedString(plan.price, 120);
    const included = boundedString(plan.included, 180);
    if (!name || !price) return [];
    return [{ name, price, included }];
  });
}

export function normalizeProviderRelay(value) {
  if (!value || typeof value !== "object") return null;
  const id = boundedString(value.id, 80).toLowerCase();
  if (!providerIdPattern.test(id)) return null;

  const name = boundedString(value.name, 120);
  if (!name) return null;

  const kind = relayKinds.has(value.kind) ? value.kind : "relay";
  const status = statuses.has(value.status) ? value.status : "pending";
  const pricing = value.pricing && typeof value.pricing === "object" ? value.pricing : {};
  const supportsRecharge =
    typeof value.supportsRecharge === "boolean" ? value.supportsRecharge : false;
  const modelOffers = normalizeModelOffers(value.modelOffers);
  const models = normalizeList([
    ...(Array.isArray(value.models) ? value.models : []),
    ...modelOffers.map((offer) => offer.model),
  ]);

  return {
    id,
    name,
    kind,
    summary: boundedString(value.summary, 360, "暂无服务说明"),
    models,
    modelOffers,
    pricing: {
      summary: boundedString(pricing.summary, 180, "价格待核验"),
      unit: boundedString(pricing.unit, 120, "以平台公开说明为准"),
      plans: normalizePlans(pricing.plans),
    },
    status,
    statusLabel: statusLabels[status],
    speed: normalizeMetric(value.speed, "待监测"),
    stability: normalizeMetric(value.stability, "待核验"),
    supportsRecharge,
    apiBaseUrl: safeUrl(value.apiBaseUrl, { allowRelative: true }),
    runtimeProviderId: boundedString(value.runtimeProviderId, 80).toLowerCase() ||
      (id === DEFAULT_PROVIDER_RELAY_ID ? "routing" : ""),
    concurrency: boundedString(value.concurrency, 180, "待平台资料核验"),
    usage: boundedString(value.usage, 500, "请先阅读平台使用说明。"),
    docs: boundedString(value.docs, 500, "公开文档待补充。"),
    docsUrl: safeUrl(value.docsUrl),
    lastVerifiedAt: /^\d{4}-\d{2}-\d{2}$/.test(value.lastVerifiedAt || "")
      ? value.lastVerifiedAt
      : "",
    featured: value.featured === true,
  };
}

export function normalizeProviderRelays(value) {
  const raw = Array.isArray(value)
    ? value
    : value?.providers && typeof value.providers === "object"
      ? Object.values(value.providers)
      : [];
  const seen = new Set();
  return raw.flatMap((item) => {
    const normalized = normalizeProviderRelay(item);
    if (!normalized || seen.has(normalized.id)) return [];
    seen.add(normalized.id);
    return [normalized];
  }).slice(0, 50);
}

export function defaultProviderRelayConfig() {
  return { version: 1, providers: structuredClone(defaultProviderRelays) };
}

export function publicProviderRelay(value) {
  const normalized = normalizeProviderRelay(value);
  if (!normalized) return null;
  const { runtimeProviderId: _runtimeProviderId, ...publicValue } = normalized;
  return structuredClone(publicValue);
}

export function publicProviderRelays(value) {
  return normalizeProviderRelays(value).map(publicProviderRelay).filter(Boolean);
}

export function publicProviderModelPrices(value, requestedModel = "") {
  const query = typeof requestedModel === "string" ? requestedModel.trim().toLowerCase() : "";
  const providers = publicProviderRelays(value);
  const modelSet = new Set();
  const offers = [];
  for (const provider of providers) {
    for (const offer of provider.modelOffers) {
      modelSet.add(offer.model);
      if (query && !offer.model.toLowerCase().includes(query)) continue;
      offers.push({
        providerId: provider.id,
        providerName: provider.name,
        providerKind: provider.kind,
        providerStatus: provider.status,
        providerStatusLabel: provider.statusLabel,
        model: offer.model,
        label: offer.label,
        status: offer.status,
        statusLabel: offer.statusLabel,
        multiplier: offer.multiplier,
        inputPrice: offer.inputPrice,
        outputPrice: offer.outputPrice,
        currency: offer.currency,
        unit: offer.unit,
        billing: offer.billing,
        notes: offer.notes,
        sourceUrl: offer.sourceUrl,
        lastVerifiedAt: offer.lastVerifiedAt,
        speed: provider.speed,
        stability: provider.stability,
      });
    }
  }
  offers.sort((left, right) => {
    const leftMultiplier = left.multiplier === null ? Number.POSITIVE_INFINITY : left.multiplier;
    const rightMultiplier = right.multiplier === null ? Number.POSITIVE_INFINITY : right.multiplier;
    return leftMultiplier - rightMultiplier || left.providerName.localeCompare(right.providerName, "zh-CN");
  });
  return {
    models: Array.from(modelSet).sort((left, right) => left.localeCompare(right, "zh-CN")),
    offers,
  };
}

export function providerRelayStatusLabel(status) {
  return statusLabels[status] || statusLabels.pending;
}
