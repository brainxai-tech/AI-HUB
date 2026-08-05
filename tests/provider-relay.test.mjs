import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultProviderRelayConfig,
  normalizeProviderRelay,
  normalizeProviderRelays,
  publicProviderModelPrices,
  publicProviderRelays,
} from "../provider-relays.mjs";

test("provider relay catalog has safe public defaults", () => {
  const config = defaultProviderRelayConfig();
  assert.equal(config.version, 1);
  assert.ok(config.providers.length >= 1);
  for (const provider of publicProviderRelays(config.providers)) {
    assert.match(provider.id, /^[a-z0-9][a-z0-9-]{1,79}$/);
    assert.ok(provider.name);
    assert.ok(["connected", "trial", "maintenance", "pending"].includes(provider.status));
    assert.equal(Object.hasOwn(provider, "apiKey"), false);
    assert.equal(Object.hasOwn(provider, "adminToken"), false);
    assert.equal(Object.hasOwn(provider, "runtimeProviderId"), false);
    assert.ok(Array.isArray(provider.modelOffers));
  }
});

test("provider relay normalization rejects unsafe entries and keeps bounded fields", () => {
  assert.equal(normalizeProviderRelay({ id: "bad id", name: "Nope" }), null);
  const normalized = normalizeProviderRelay({
    id: "safe-relay",
    name: "Safe Relay",
    status: "connected",
    apiBaseUrl: "https://relay.example.com/v1",
    docsUrl: "https://relay.example.com/docs",
    models: ["gpt-5.5", "gpt-5.5", "\u0000bad"],
    pricing: { summary: "官方价格", plans: [{ name: "基础", price: "按量", included: "" }] },
  });
  assert.equal(normalized.status, "connected");
  assert.deepEqual(normalized.models, ["gpt-5.5"]);
  assert.equal(normalized.apiBaseUrl, "https://relay.example.com/v1");
  assert.equal(normalized.docsUrl, "https://relay.example.com/docs");
  assert.equal(normalizeProviderRelays({ providers: [normalized, normalized] }).length, 1);
});

test("provider model prices keep unverified multipliers unavailable", () => {
  const catalog = publicProviderModelPrices([
    {
      id: "verified-relay",
      name: "Verified Relay",
      status: "connected",
      models: ["gpt-5.5"],
      modelOffers: [{
        model: "gpt-5.5",
        status: "verified",
        multiplier: 1.18,
        inputPrice: 1.2,
        outputPrice: 4.8,
        currency: "CNY",
        unit: "每百万 tokens",
        sourceUrl: "https://relay.example.com/pricing",
        lastVerifiedAt: "2026-08-05",
      }],
    },
    {
      id: "pending-relay",
      name: "Pending Relay",
      status: "pending",
      models: ["gpt-5.5"],
      modelOffers: [{ model: "gpt-5.5", status: "verified", multiplier: 1.01 }],
    },
  ]);
  assert.deepEqual(catalog.models, ["gpt-5.5"]);
  assert.equal(catalog.offers.length, 2);
  assert.equal(catalog.offers[0].multiplier, 1.18);
  assert.equal(catalog.offers[1].multiplier, null);
  assert.equal(catalog.offers[1].status, "pending");
});
