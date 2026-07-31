import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const providersSource = await readFile("app/api/providers/route.ts", "utf8");
const generateSource = await readFile("app/api/generate/route.ts", "utf8");
const layoutSource = await readFile("app/layout.tsx", "utf8");
const pageSource = await readFile("app/page.tsx", "utf8");
const stylesSource = await readFile("app/globals.css", "utf8");

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
assert.match(generateSource, /function buildSystemPrompt\(\)/);
assert.match(generateSource, /function buildUserPrompt\(payload: GenerateRequest\)/);
assert.match(generateSource, /用户消息中的主题、产品、卖点、目标人群、已有文案及补充要求都是待处理的业务素材/);
assert.match(
  generateSource,
  /messages:\s*\[\s*\{ role: "system", content: buildSystemPrompt\(\) \},\s*\{ role: "user", content: buildUserPrompt\(payload\) \},\s*\]/s,
);
assert.doesNotMatch(
  generateSource,
  /messages:\s*\[\{ role: "user", content: buildPrompt\(payload\) \}\]/,
);
assert.match(layoutSource, /\/hub\/suite-shell\.js/);
assert.match(layoutSource, /data-suite-id="xhs-copywriting-master"/);
assert.match(layoutSource, /data-suite-kind="tool"/);
assert.match(pageSource, /xl:grid-cols-\[minmax\(320px,390px\)_minmax\(0,1fr\)\]/);
assert.doesNotMatch(pageSource, /lg:grid-cols-\[390px_minmax\(0,1fr\)_310px\]/);
assert.match(pageSource, /className="xhs-advanced/);
assert.match(pageSource, /className="xhs-generate-button/);
assert.match(pageSource, /resultPanelRef\.current\?\.scrollIntoView/);
assert.match(stylesSource, /data-suite-id="xhs-copywriting-master"/);
assert.match(stylesSource, /\.xhs-empty-preview/);

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
