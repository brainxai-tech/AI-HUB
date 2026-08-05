import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const modelPattern = /^[a-z0-9][a-z0-9._:-]{0,99}$/i;
const hashPattern = /^[a-f0-9]{64}$/;
const opaqueTokenPattern = /^[A-Za-z0-9_-]{32,256}$/;
const pricingStatuses = new Set(["draft", "verified", "disabled"]);
const ledgerTypes = new Set(["hold", "release", "usage", "grant", "refund", "adjustment"]);
const maxLedgerEntries = 100_000;
const maxIdempotencyEntries = 10_000;
const microsPerYuan = 1_000_000;

function boundedString(value, maximum, fallback = "") {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  if (!next || next.length > maximum || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function normalizeId(value, fallback = "") {
  const id = boundedString(value, 120);
  return /^[a-z0-9][a-z0-9_-]{2,119}$/i.test(id) ? id : fallback;
}

function normalizeIso(value, fallback = "") {
  const text = boundedString(value, 40);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeMicroAmount(value, fallback = 0) {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : fallback;
}

function normalizeSignedMicroAmount(value, fallback = 0) {
  if (typeof value === "string" && /^-?\d+$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : fallback;
}

function safeUrl(value) {
  const next = boundedString(value, 500);
  if (!next) return "";
  try {
    const url = new URL(next);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.toString().replace(/\/$/, "")
      : "";
  } catch {
    return "";
  }
}

function normalizePricingRecord(model, value) {
  if (!modelPattern.test(model) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = pricingStatuses.has(value.status) ? value.status : "draft";
  const record = {
    model,
    label: boundedString(value.label, 120, model),
    status,
    enabled: value.enabled === true && status === "verified",
    upstreamInputMicrosPerMillion: normalizeMicroAmount(value.upstreamInputMicrosPerMillion),
    upstreamOutputMicrosPerMillion: normalizeMicroAmount(value.upstreamOutputMicrosPerMillion),
    sellInputMicrosPerMillion: normalizeMicroAmount(value.sellInputMicrosPerMillion),
    sellOutputMicrosPerMillion: normalizeMicroAmount(value.sellOutputMicrosPerMillion),
    currency: boundedString(value.currency, 12, "CNY"),
    unit: boundedString(value.unit, 80, "每百万 tokens"),
    sourceUrl: safeUrl(value.sourceUrl),
    lastVerifiedAt: normalizeIso(value.lastVerifiedAt),
    updatedAt: normalizeIso(value.updatedAt, new Date(0).toISOString()),
  };
  const upstreamInput = record.upstreamInputMicrosPerMillion;
  const upstreamOutput = record.upstreamOutputMicrosPerMillion;
  const sellInput = record.sellInputMicrosPerMillion;
  const sellOutput = record.sellOutputMicrosPerMillion;
  if (
    record.enabled &&
    (!record.sourceUrl || !record.lastVerifiedAt || upstreamInput <= 0 || upstreamOutput <= 0 || sellInput <= 0 || sellOutput <= 0)
  ) {
    record.enabled = false;
    record.status = "draft";
  }
  return record;
}

function normalizeUser(value, id) {
  if (!value || typeof value !== "object") return null;
  const email = normalizeEmail(value.email);
  const passwordHash = boundedString(value.passwordHash, 400);
  if (!id || !email || !passwordHash) return null;
  return {
    id,
    email,
    passwordHash,
    role: value.role === "admin" ? "admin" : "user",
    balanceMicros: normalizeMicroAmount(value.balanceMicros),
    createdAt: normalizeIso(value.createdAt, new Date(0).toISOString()),
    lastLoginAt: normalizeIso(value.lastLoginAt),
    enabled: value.enabled !== false,
  };
}

function normalizeSession(value, id) {
  if (!value || typeof value !== "object" || !id) return null;
  const tokenHash = boundedString(value.tokenHash, 64).toLowerCase();
  const userId = normalizeId(value.userId);
  const expiresAt = normalizeIso(value.expiresAt);
  if (!hashPattern.test(tokenHash) || !userId || !expiresAt) return null;
  return { id, tokenHash, userId, createdAt: normalizeIso(value.createdAt, new Date(0).toISOString()), expiresAt, revokedAt: normalizeIso(value.revokedAt) };
}

function normalizeApiKey(value, id) {
  if (!value || typeof value !== "object" || !id) return null;
  const keyHash = boundedString(value.keyHash, 64).toLowerCase();
  const userId = normalizeId(value.userId);
  const prefix = boundedString(value.prefix, 32);
  if (!hashPattern.test(keyHash) || !userId || !prefix) return null;
  return {
    id,
    userId,
    keyHash,
    prefix,
    name: boundedString(value.name, 80, "默认 Key"),
    createdAt: normalizeIso(value.createdAt, new Date(0).toISOString()),
    lastUsedAt: normalizeIso(value.lastUsedAt),
    revokedAt: normalizeIso(value.revokedAt),
  };
}

function normalizeLedgerEntry(value) {
  if (!value || typeof value !== "object") return null;
  const id = normalizeId(value.id);
  const userId = normalizeId(value.userId);
  const type = ledgerTypes.has(value.type) ? value.type : "adjustment";
  const amountMicros = normalizeSignedMicroAmount(value.amountMicros, NaN);
  if (!id || !userId || !Number.isSafeInteger(amountMicros) || amountMicros === 0) return null;
  return {
    id,
    userId,
    type,
    amountMicros,
    balanceAfterMicros: normalizeMicroAmount(value.balanceAfterMicros),
    requestId: boundedString(value.requestId, 160),
    model: boundedString(value.model, 100),
    inputTokens: boundedInteger(value.inputTokens, 0, 0, 100_000_000),
    outputTokens: boundedInteger(value.outputTokens, 0, 0, 100_000_000),
    estimatedUsage: value.estimatedUsage === true,
    note: boundedString(value.note, 240),
    createdAt: normalizeIso(value.createdAt, new Date(0).toISOString()),
  };
}

function normalizeIdempotency(value) {
  if (!value || typeof value !== "object") return null;
  const userId = normalizeId(value.userId);
  const status = value.status === "completed" ? "completed" : "pending";
  const requestId = boundedString(value.requestId, 160);
  const createdAt = normalizeIso(value.createdAt);
  if (!userId || !requestId || !createdAt) return null;
  let response = null;
  if (status === "completed" && value.response && typeof value.response === "object") {
    const serialized = JSON.stringify(value.response);
    if (serialized.length <= 512 * 1024) response = value.response;
  }
  return { userId, requestId, status, response, createdAt };
}

export function normalizeEmail(value) {
  const email = boundedString(value, 254).toLowerCase();
  return emailPattern.test(email) ? email : "";
}

export function normalizeRelayCommerce(raw) {
  const users = {};
  if (raw?.users && typeof raw.users === "object" && !Array.isArray(raw.users)) {
    for (const [id, value] of Object.entries(raw.users)) {
      const normalized = normalizeUser(value, id);
      if (normalized) users[id] = normalized;
    }
  }

  const sessions = {};
  if (raw?.sessions && typeof raw.sessions === "object" && !Array.isArray(raw.sessions)) {
    for (const [id, value] of Object.entries(raw.sessions)) {
      const normalized = normalizeSession(value, id);
      if (normalized && users[normalized.userId]) sessions[id] = normalized;
    }
  }

  const apiKeys = {};
  if (raw?.apiKeys && typeof raw.apiKeys === "object" && !Array.isArray(raw.apiKeys)) {
    for (const [id, value] of Object.entries(raw.apiKeys)) {
      const normalized = normalizeApiKey(value, id);
      if (normalized && users[normalized.userId]) apiKeys[id] = normalized;
    }
  }

  const pricing = {};
  if (raw?.pricing && typeof raw.pricing === "object" && !Array.isArray(raw.pricing)) {
    for (const [model, value] of Object.entries(raw.pricing)) {
      const normalized = normalizePricingRecord(model, value);
      if (normalized) pricing[model] = normalized;
    }
  }

  const ledger = Array.isArray(raw?.ledger)
    ? raw.ledger.map(normalizeLedgerEntry).filter(Boolean).slice(-maxLedgerEntries)
    : [];
  const idempotency = {};
  if (raw?.idempotency && typeof raw.idempotency === "object" && !Array.isArray(raw.idempotency)) {
    for (const [key, value] of Object.entries(raw.idempotency).slice(-maxIdempotencyEntries)) {
      const normalized = normalizeIdempotency(value);
      if (normalized && opaqueTokenPattern.test(key)) idempotency[key] = normalized;
    }
  }

  return { version: 1, users, sessions, apiKeys, pricing, ledger, idempotency };
}

export function defaultRelayCommerceConfig() {
  return normalizeRelayCommerce({ version: 1, users: {}, sessions: {}, apiKeys: {}, pricing: {}, ledger: [], idempotency: {} });
}

export function hashOpaqueToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function safeHashEqual(left, right) {
  if (!hashPattern.test(left) || !hashPattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(String(password), salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  const match = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([^$]+)\$([^$]+)$/.exec(String(encoded || ""));
  if (!match) return false;
  const [, costText, blockText, parallelText, salt, expectedText] = match;
  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelization = Number(parallelText);
  if (!Number.isInteger(cost) || cost < 16_384 || cost > 65_536 || blockSize !== 8 || parallelization !== 1) return false;
  try {
    const derived = await scrypt(String(password), salt, 64, { N: cost, r: blockSize, p: parallelization, maxmem: 128 * 1024 * 1024 });
    const expected = Buffer.from(expectedText, "base64url");
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function createUserRecord({ email, passwordHash, role = "user" }) {
  const now = new Date().toISOString();
  const id = `user_${randomUUID().replaceAll("-", "")}`;
  return { id, email: normalizeEmail(email), passwordHash, role: role === "admin" ? "admin" : "user", balanceMicros: 0, createdAt: now, lastLoginAt: "", enabled: true };
}

export function createSessionRecord(userId, token) {
  const now = Date.now();
  const id = `session_${randomUUID().replaceAll("-", "")}`;
  return {
    id,
    token,
    record: {
      id,
      tokenHash: hashOpaqueToken(token),
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: "",
    },
  };
}

export function createApiKeyRecord(userId, name = "默认 Key") {
  const rawKey = `ahub_${createOpaqueToken(32)}`;
  const now = new Date().toISOString();
  const id = `key_${randomUUID().replaceAll("-", "")}`;
  return {
    rawKey,
    record: {
      id,
      userId,
      keyHash: hashOpaqueToken(rawKey),
      prefix: rawKey.slice(0, 16),
      name: boundedString(name, 80, "默认 Key"),
      createdAt: now,
      lastUsedAt: "",
      revokedAt: "",
    },
  };
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role, enabled: user.enabled, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
}

export function publicApiKey(key) {
  return { id: key.id, name: key.name, prefix: key.prefix, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revoked: Boolean(key.revokedAt) };
}

export function publicPricing(pricing) {
  return Object.values(pricing || {}).map((value) => ({
    model: value.model,
    label: value.label,
    status: value.status,
    enabled: value.enabled,
    sellInputPrice: value.sellInputMicrosPerMillion > 0 ? value.sellInputMicrosPerMillion / microsPerYuan : null,
    sellOutputPrice: value.sellOutputMicrosPerMillion > 0 ? value.sellOutputMicrosPerMillion / microsPerYuan : null,
    upstreamInputPrice: value.upstreamInputMicrosPerMillion > 0 ? value.upstreamInputMicrosPerMillion / microsPerYuan : null,
    upstreamOutputPrice: value.upstreamOutputMicrosPerMillion > 0 ? value.upstreamOutputMicrosPerMillion / microsPerYuan : null,
    multiplierInput: value.upstreamInputMicrosPerMillion > 0 ? value.sellInputMicrosPerMillion / value.upstreamInputMicrosPerMillion : null,
    multiplierOutput: value.upstreamOutputMicrosPerMillion > 0 ? value.sellOutputMicrosPerMillion / value.upstreamOutputMicrosPerMillion : null,
    currency: value.currency,
    unit: value.unit,
    sourceUrl: value.sourceUrl,
    lastVerifiedAt: value.lastVerifiedAt,
  })).sort((left, right) => left.model.localeCompare(right.model));
}

export function publicWallet(user, ledger) {
  const entries = (ledger || []).filter((entry) => entry.userId === user.id).slice(-100).reverse();
  return {
    balanceMicros: user.balanceMicros,
    balanceCny: user.balanceMicros / microsPerYuan,
    currency: "CNY",
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amountCny: entry.amountMicros / microsPerYuan,
      balanceCny: entry.balanceAfterMicros / microsPerYuan,
      requestId: entry.requestId,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      estimatedUsage: entry.estimatedUsage,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
  };
}

export function calculateUsageCost(pricing, inputTokens, outputTokens) {
  const input = BigInt(Math.max(0, Math.trunc(inputTokens || 0)));
  const output = BigInt(Math.max(0, Math.trunc(outputTokens || 0)));
  const inputRate = BigInt(Math.max(0, Math.trunc(pricing?.sellInputMicrosPerMillion || 0)));
  const outputRate = BigInt(Math.max(0, Math.trunc(pricing?.sellOutputMicrosPerMillion || 0)));
  const total = (input * inputRate + output * outputRate + 999_999n) / 1_000_000n;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Usage cost exceeds safe integer range.");
  return Number(total);
}

export function estimateUsageTokens(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const serialized = JSON.stringify(messages);
  const inputTokens = Math.min(100_000_000, Math.max(1, Math.ceil(Buffer.byteLength(serialized, "utf8") / 3)));
  const requestedOutput = Number.isInteger(payload?.max_tokens)
    ? payload.max_tokens
    : Number.isInteger(payload?.max_completion_tokens)
      ? payload.max_completion_tokens
      : 1024;
  return { inputTokens, outputTokens: Math.min(100_000, Math.max(1, requestedOutput)) };
}

export function addLedgerEntry(config, userId, entry) {
  const user = config.users[userId];
  if (!user) throw new Error("User not found.");
  const amountMicros = normalizeSignedMicroAmount(entry.amountMicros, NaN);
  if (!Number.isSafeInteger(amountMicros) || amountMicros === 0) throw new Error("Ledger amount is invalid.");
  const nextBalance = user.balanceMicros + amountMicros;
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    const error = new Error("Insufficient relay wallet balance.");
    error.code = "INSUFFICIENT_BALANCE";
    throw error;
  }
  user.balanceMicros = nextBalance;
  const normalized = normalizeLedgerEntry({ ...entry, id: entry.id || `ledger_${randomUUID().replaceAll("-", "")}`, userId, amountMicros, balanceAfterMicros: nextBalance, createdAt: entry.createdAt || new Date().toISOString() });
  if (!normalized) throw new Error("Ledger entry is invalid.");
  config.ledger.push(normalized);
  if (config.ledger.length > maxLedgerEntries) config.ledger.splice(0, config.ledger.length - maxLedgerEntries);
  return normalized;
}

export function findUserByEmail(config, email) {
  const normalizedEmail = normalizeEmail(email);
  return Object.values(config.users).find((user) => user.email === normalizedEmail) || null;
}

export function findUserBySessionToken(config, token) {
  if (!opaqueTokenPattern.test(String(token || ""))) return null;
  const tokenHash = hashOpaqueToken(token);
  const now = Date.now();
  const session = Object.values(config.sessions).find((value) => value.tokenHash === tokenHash && !value.revokedAt && new Date(value.expiresAt).getTime() > now);
  return session && config.users[session.userId]?.enabled ? { user: config.users[session.userId], session } : null;
}

export function findUserByApiKey(config, token) {
  if (!/^ahub_[A-Za-z0-9_-]{32,256}$/.test(String(token || ""))) return null;
  const keyHash = hashOpaqueToken(token);
  const apiKey = Object.values(config.apiKeys).find((value) => value.keyHash === keyHash && !value.revokedAt);
  return apiKey && config.users[apiKey.userId]?.enabled ? { user: config.users[apiKey.userId], apiKey } : null;
}

export function normalizeRelayPricing(value) {
  const source = Array.isArray(value)
    ? Object.fromEntries(value.filter((item) => item?.model).map((item) => [item.model, item]))
    : value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  const pricing = {};
  for (const [model, record] of Object.entries(source)) {
    const normalized = normalizePricingRecord(model, record);
    if (normalized) pricing[model] = normalized;
  }
  return pricing;
}

export { microsPerYuan };
