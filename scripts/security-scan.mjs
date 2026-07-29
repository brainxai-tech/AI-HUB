import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const failures = [];

const forbiddenPaths = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /(^|\/)\.local-runtime\//,
  /(^|\/)\.env(?:\.|$)/,
  /\.(?:pem|pfx|p12|jks)$/i,
  /(^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /(?:^|\/)(?:backups?|uploads?|logs?)(?:\/|$)/i,
];

for (const file of tracked) {
  if (file === ".env.example") continue;
  if (forbiddenPaths.some((pattern) => pattern.test(file))) failures.push(`forbidden tracked path: ${file}`);
}

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/,
];

for (const file of tracked) {
  if (/\.(?:png|jpe?g|webp|avif|ico|woff2?|zip|pptx)$/i.test(file)) continue;
  const content = readFileSync(path.join(root, file), "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) failures.push(`secret-like value in ${file}: ${pattern}`);
  }
}

const manifest = JSON.parse(readFileSync(path.join(root, "deploy/project-manifest.json"), "utf8"));
if (manifest.projects.length !== 29) failures.push(`manifest project count is ${manifest.projects.length}, expected 29`);
const projectIds = new Set(manifest.projects.map(({ id }) => id));
for (const game of manifest.excludedGames || []) {
  if (projectIds.has(game)) failures.push(`excluded game appears in non-game manifest: ${game}`);
}

for (const project of manifest.projects.filter(({ api }) => api === "dedicated")) {
  const browserRoot = `${project.source}/dist/`;
  const serverRoot = `${project.source}/dist-server/`;
  const browserFiles = tracked.filter((file) => file.startsWith(browserRoot) && /\.(?:html|js)$/i.test(file));
  const serverFiles = tracked.filter((file) => file.startsWith(serverRoot) && file.endsWith(".js"));
  for (const file of browserFiles) {
    const source = readFileSync(path.join(root, file), "utf8");
    if (/apiKey|apiBaseUrl|Authorization|HUB_PROJECT_TOKEN|type:[^,}]*password/i.test(source)) {
      failures.push(`dedicated browser routing credential surface in ${file}`);
    }
  }
  for (const file of serverFiles) {
    const source = readFileSync(path.join(root, file), "utf8");
    if (/drhknode\.airouting\.com|normalizeChatEndpoint|request\.apiKey|request\.model|Authorization/i.test(source)) {
      failures.push(`dedicated server direct-provider fallback in ${file}`);
    }
  }
}

if (failures.length) {
  console.error(`Security scan failed with ${failures.length} finding(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Security scan passed: ${tracked.length} tracked files, ${manifest.projects.length} non-game projects, no committed secrets or dedicated direct-provider paths.`);
}
