import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "dist/index.html",
  "dist/assets/index-BrxDrXKa.css",
  "dist/assets/index-hub-key-ec74c97443.js",
  "dist-server/server/fileParser.js",
  "dist-server/server/hubRuntime.js",
  "dist-server/server/index.js",
  "dist-server/server/pptxExporter.js",
  "dist-server/server/prompt.js",
  "dist-server/server/providerGateway.js",
  "dist-server/src/shared/contracts.js",
];

for (const relative of required) {
  if (!existsSync(resolve(root, relative))) throw new Error(`Missing recovered release file: ${relative}`);
}

const index = readFileSync(resolve(root, "dist/index.html"), "utf8");
for (const expected of [
  'data-suite-id="ai-ppt-report-coach"',
  'data-suite-api="/ppt-report-coach"',
  'data-suite-hub="/hub/"',
  '/ppt-report-coach/assets/index-hub-key-ec74c97443.js',
]) {
  if (!index.includes(expected)) throw new Error(`Missing unified shell marker: ${expected}`);
}

const browserBundle = readFileSync(resolve(root, "dist/assets/index-hub-key-ec74c97443.js"), "utf8");
new Script(browserBundle);

for (const forbidden of [
  /type:`password`/i,
  /localStorage/i,
  /apiKey/i,
  /apiBaseUrl/i,
  /个人 API/i,
  /演示模式/i,
  /deepseek|claude|gemini|anthropic|openrouter/i,
]) {
  if (forbidden.test(browserBundle)) throw new Error(`Legacy frontend fragment remains: ${forbidden}`);
}

for (const relative of required.filter((file) => file.endsWith(".js") && !file.startsWith("dist/assets/"))) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, relative)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Invalid JavaScript: ${relative}`);
}

console.log(`Recovered PPT release verified: ${required.length} files, Hub GPT-only routing`);
