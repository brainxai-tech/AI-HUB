import assert from "node:assert/strict";
import test from "node:test";
import {
  addLedgerEntry,
  calculateUsageCost,
  createApiKeyRecord,
  createSessionRecord,
  createUserRecord,
  defaultRelayCommerceConfig,
  estimateUsageTokens,
  findUserByApiKey,
  findUserBySessionToken,
  hashPassword,
  normalizeRelayCommerce,
  publicPricing,
  verifyPassword,
} from "../relay-commerce.mjs";

test("relay commerce normalization keeps secrets out of public projections", async () => {
  const passwordHash = await hashPassword("safe-password-123");
  const config = normalizeRelayCommerce({
    users: { user_demo: { id: "user_demo", email: "DEMO@example.com", passwordHash, balanceMicros: 1250000 } },
    pricing: {
      "gpt-5.5": {
        status: "verified",
        enabled: true,
        upstreamInputMicrosPerMillion: 1000000,
        upstreamOutputMicrosPerMillion: 4000000,
        sellInputMicrosPerMillion: 1200000,
        sellOutputMicrosPerMillion: 4800000,
        sourceUrl: "https://example.com/pricing",
        lastVerifiedAt: "2026-08-05",
      },
    },
  });
  assert.equal(config.users.user_demo.email, "demo@example.com");
  assert.equal(await verifyPassword("safe-password-123", config.users.user_demo.passwordHash), true);
  assert.equal(await verifyPassword("wrong-password", config.users.user_demo.passwordHash), false);
  assert.equal(publicPricing(config.pricing)[0].multiplierInput, 1.2);
  assert.equal(JSON.stringify(publicPricing(config.pricing)).includes(passwordHash), false);
});

test("relay session and API key lookup only accept their raw token", () => {
  const config = defaultRelayCommerceConfig();
  const user = createUserRecord({ email: "user@example.com", passwordHash: "scrypt$placeholder" });
  config.users[user.id] = user;
  const session = createSessionRecord(user.id, "session_abcdefghijklmnopqrstuvwxyz0123456789");
  config.sessions[session.record.id] = session.record;
  const apiKey = createApiKeyRecord(user.id, "test");
  config.apiKeys[apiKey.record.id] = apiKey.record;
  const sessionAuth = findUserBySessionToken(config, session.token);
  const keyAuth = findUserByApiKey(config, apiKey.rawKey);
  assert.equal(sessionAuth.user.id, user.id);
  assert.equal(keyAuth.user.id, user.id);
  assert.equal(findUserBySessionToken(config, "wrong_session_token_abcdefghijklmnopqrstuvwxyz"), null);
  assert.equal(findUserByApiKey(config, "ahub_wrong_key_abcdefghijklmnopqrstuvwxyz"), null);
});

test("usage pricing uses integer micros and ledger refuses overdraft", () => {
  const config = defaultRelayCommerceConfig();
  const user = createUserRecord({ email: "billing@example.com", passwordHash: "scrypt$placeholder" });
  config.users[user.id] = user;
  addLedgerEntry(config, user.id, { type: "grant", amountMicros: 2_000_000, note: "test" });
  const pricing = { sellInputMicrosPerMillion: 1_200_000, sellOutputMicrosPerMillion: 4_800_000 };
  assert.equal(calculateUsageCost(pricing, 1_000_000, 500_000), 3_600_000);
  assert.throws(() => addLedgerEntry(config, user.id, { type: "usage", amountMicros: -2_000_001 }), /Insufficient/);
  assert.equal(config.users[user.id].balanceMicros, 2_000_000);
});

test("relay token estimation is bounded", () => {
  const estimate = estimateUsageTokens({ messages: [{ role: "user", content: "hello" }], max_tokens: 999999 });
  assert.ok(estimate.inputTokens >= 1);
  assert.equal(estimate.outputTokens, 100000);
});
