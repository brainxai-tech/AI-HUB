import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const providersSource = await readFile("app/api/providers/route.ts", "utf8");
const generateSource = await readFile("app/api/generate/route.ts", "utf8");
const layoutSource = await readFile("app/layout.tsx", "utf8");

assert.match(providersSource, /export async function GET/);
assert.match(providersSource, /AI_HUB_MODEL_CONFIG_URL/);
assert.match(providersSource, /HUB_MODEL_CONFIG_URL/);
assert.match(providersSource, /x-hub-project-token/);
assert.match(providersSource, /hubUrl:\s*"\/hub\/#models"/);
assert.match(providersSource, /provider:\s*localProvider\.id/);
assert.match(providersSource, /id:\s*"openai"/);
assert.match(providersSource, /function isGptModel/);
assert.doesNotMatch(providersSource, /id:\s*"(?:deepseek|gemini|anthropic)"/);
assert.match(generateSource, /withHubApiPath\(baseUrl,\s*"\/api\/chat"\)/);
assert.match(layoutSource, /\/hub\/suite-shell\.js/);
assert.match(layoutSource, /data-suite-id="xhs-copywriting-master"/);

const baseUrl = process.env.VERIFY_BASE_URL?.replace(/\/+$/, "");
if (baseUrl) {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);

  const providers = await fetch(`${baseUrl}/api/providers`);
  assert.equal(providers.status, 200);
  assert.match(providers.headers.get("content-type") ?? "", /application\/json/);

  const body = await providers.json();
  assert.equal(Array.isArray(body.providers), true);
  assert.equal(typeof body.configured, "boolean");
  assert.equal(body.hubUrl, "/hub/#models");
  assert.deepEqual(body.providers.map((provider) => provider.provider), ["openai"]);
  assert.ok(
    body.providers.every(
      (provider) =>
        typeof provider.provider === "string" &&
        typeof provider.label === "string" &&
        Array.isArray(provider.models) &&
        Array.isArray(provider.enabledModels) &&
        typeof provider.configured === "boolean",
    ),
  );
}

console.log("verify ok");
