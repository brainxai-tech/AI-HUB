import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "dist/index.html",
  "dist/favicon.svg",
  "dist/assets/index-BB_V0AZv.css",
  "dist/assets/index-hub-routing.js",
  "dist-server/server/hubRuntime.js",
  "dist-server/server/index.js",
  "dist-server/server/prompt.js",
  "dist-server/server/providerGateway.js",
  "dist-server/src/shared/contracts.js",
];

for (const relative of required) {
  if (!existsSync(resolve(root, relative))) throw new Error(`Missing recovered release file: ${relative}`);
}

const index = readFileSync(resolve(root, "dist/index.html"), "utf8");
for (const expected of [
  'data-suite-id="ai-work-report-generator"',
  'data-suite-api="/work-report"',
  'data-suite-hub="/hub/"',
  '/work-report/assets/index-hub-routing.js',
]) {
  if (!index.includes(expected)) throw new Error(`Missing unified shell marker: ${expected}`);
}

const browserBundle = readFileSync(resolve(root, "dist/assets/index-hub-routing.js"), "utf8");
new Script(browserBundle);

for (const forbidden of [
  /type:[^,}]*password/i,
  /sessionStorage/i,
  /apiKey/i,
  /apiBaseUrl/i,
  /BYOK/i,
  /gpt-5\.4-mini|gpt-5\.5/i,
]) {
  if (forbidden.test(browserBundle)) throw new Error(`Legacy frontend fragment remains: ${forbidden}`);
}
if (!browserBundle.includes("shubao-report-history") || !browserBundle.includes("localStorage")) {
  throw new Error("Local report history storage was not retained");
}
if (!browserBundle.includes('dn=`/work-report/`.replace')) {
  throw new Error("Recovered browser release does not use the unified /work-report API base path");
}

const contracts = readFileSync(resolve(root, "dist-server/src/shared/contracts.js"), "utf8");
if (/apiKey|apiBaseUrl|model:\s*z\./i.test(contracts)) throw new Error("Legacy client routing fields remain in request schema");
if (!contracts.includes("}).strict();")) throw new Error("Generate request schema must reject unknown routing fields");

const gateway = readFileSync(resolve(root, "dist-server/server/providerGateway.js"), "utf8");
for (const forbidden of [/Authorization/i, /normalizeChatEndpoint/i, /request\.apiKey/i, /request\.model/i]) {
  if (forbidden.test(gateway)) throw new Error(`Direct provider fallback remains: ${forbidden}`);
}
if (!gateway.includes('hubRuntime.provider !== "openai"') || !gateway.includes("isGptModel(hubRuntime.model)")) {
  throw new Error("Provider boundary is not restricted to Hub GPT routing");
}

for (const relative of required.filter((file) => file.endsWith(".js") && !file.startsWith("dist/assets/"))) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, relative)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Invalid JavaScript: ${relative}`);
}

console.log(`Recovered work report release verified: ${required.length} files, Hub GPT-only routing`);
