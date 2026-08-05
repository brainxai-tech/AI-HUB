import { setTimeout as delay } from "node:timers/promises";
import { createCookingCoachServer } from "../server.mjs";

const requestedPort = Number.parseInt(process.env.VERIFY_PORT || "0", 10);
const publicBasePath = "/cooking";
const timeoutMs = Number.parseInt(process.env.VERIFY_TIMEOUT_MS || "15000", 10);
const requiredProviders = ["openai"];

const server = createCookingCoachServer();
const port = await listen(server, requestedPort);
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const providers = await waitForProviders();
  assertProviderPayload(providers);
  console.log(
    `provider smoke ok: ${providers.providers.length} providers, configured=${Boolean(providers.configured)}`
  );
} finally {
  await close(server);
}

async function waitForProviders() {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const homeResponse = await fetch(baseUrl, { cache: "no-store" });
      if (homeResponse.status >= 500) {
        throw new Error(`home returned HTTP ${homeResponse.status}`);
      }

      const response = await fetch(`${baseUrl}/api/providers`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`/api/providers returned HTTP ${response.status}`);
      }
      const prefixedResponse = await fetch(`${baseUrl}${publicBasePath}/api/providers`, { cache: "no-store" });
      if (!prefixedResponse.ok) {
        throw new Error(`${publicBasePath}/api/providers returned HTTP ${prefixedResponse.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  throw new Error(`provider smoke timed out: ${lastError?.message || "unknown error"}`);
}

function listen(target, port) {
  return new Promise((resolve, reject) => {
    target.once("error", reject);
    target.listen(port, "127.0.0.1", () => {
      target.off("error", reject);
      resolve(target.address().port);
    });
  });
}

function close(target) {
  return new Promise((resolve, reject) => {
    target.close((error) => (error ? reject(error) : resolve()));
  });
}

function assertProviderPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("providers payload is not an object");
  }
  if (payload.hubUrl !== "/hub/#models") {
    throw new Error(`unexpected hubUrl: ${payload.hubUrl}`);
  }
  if (typeof payload.configured !== "boolean") {
    throw new Error("configured must be boolean");
  }
  if (!Array.isArray(payload.providers) || payload.providers.length !== requiredProviders.length) {
    throw new Error("providers must include only the unified AI Routing provider");
  }

  const providersById = new Map(payload.providers.map((provider) => [provider.id, provider]));
  for (const id of requiredProviders) {
    const provider = providersById.get(id);
    if (!provider) throw new Error(`missing provider: ${id}`);
    if (provider.provider !== id) throw new Error(`provider ${id} has mismatched provider field`);
    if (typeof provider.label !== "string" || !provider.label) {
      throw new Error(`provider ${id} is missing label`);
    }
    if (typeof provider.model !== "string") {
      throw new Error(`provider ${id} has an invalid model`);
    }
    if (!Array.isArray(provider.models)) {
      throw new Error(`provider ${id} models must be an array`);
    }
    if (!Array.isArray(provider.enabledModels)) {
      throw new Error(`provider ${id} enabledModels must be an array`);
    }
    if (typeof provider.enabled !== "boolean") {
      throw new Error(`provider ${id} enabled must be boolean`);
    }
    if (typeof provider.configured !== "boolean") {
      throw new Error(`provider ${id} configured must be boolean`);
    }
    if (provider.models.some((model) => !/^gpt-/i.test(model))) {
      throw new Error(`provider ${id} exposed a non-GPT model`);
    }
  }
}
