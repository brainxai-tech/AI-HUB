import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const requiredFiles = [
  "server.mjs",
  "src/scenarios.mjs",
  "src/prompts.mjs",
  "src/providers.mjs",
  "src/validation.mjs",
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/assets/theater-mark.svg",
  "docs/mvp-spec.md"
];

for (const file of requiredFiles) {
  await readFile(new URL(`../${file}`, import.meta.url), "utf8");
}

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

for (const id of [
  "sceneList",
  "conversation",
  "providerSelect",
  "modelSelect",
  "configState",
  "evaluateButton",
  "reportPanel"
]) {
  assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`);
}

for (const endpoint of ["api/scenarios", "api/providers", "api/roleplay", "api/hint", "api/evaluate"]) {
  assert.match(app + server, new RegExp(endpoint.replace(/\//g, "\\/")), `Missing ${endpoint}`);
}

assert.doesNotMatch(html + app + server, /apiKey|key-test|Mock ready|isMock/i, "Project-local API key and mock UI must not exist");
assert.doesNotMatch(app, /localStorage|sessionStorage/, "Browser storage must not be used for model credentials");
assert.doesNotMatch(server, /api\.openai|api\.deepseek|api\.anthropic|generativelanguage|x-api-key|Authorization:/i, "Projects must call Hub proxy instead of model providers directly");
assert.match(server, /Content-Security-Policy/, "Security headers must include CSP");

console.log("Static check passed");
