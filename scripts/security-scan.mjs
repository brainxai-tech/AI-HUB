import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.env.AIHUB_SCAN_ROOT || defaultRoot);
const hasGitMetadata = existsSync(path.join(root, ".git"));
const tracked = hasGitMetadata ? listGitFiles(root) : walkArchiveFiles(root);
const failures = [];

function listGitFiles(scanRoot) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: scanRoot })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function walkArchiveFiles(scanRoot) {
  const files = [];
  const skippedDirectories = new Set([".git", "node_modules", ".next", "coverage", ".local-runtime", ".npm-cache"]);

  const visit = (directory, relativeDirectory = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) visit(path.join(directory, entry.name), relative);
      } else if (entry.isFile()) {
        files.push(relative.split(path.sep).join("/"));
      }
    }
  };

  visit(scanRoot);
  return files.sort();
}

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
  if (/(^|\/)\.env\.example$/.test(file)) continue;
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

const manifestPath = path.resolve(process.env.AIHUB_SCAN_MANIFEST || path.join(root, "deploy/project-manifest.json"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.projects.length !== 33) failures.push(`manifest project count is ${manifest.projects.length}, expected 33`);
if (manifest.games.length !== 5) failures.push(`manifest game count is ${manifest.games.length}, expected 5`);
const entries = [...manifest.projects, ...manifest.games];
if (new Set(entries.map(({ id }) => id)).size !== entries.length) failures.push("manifest contains duplicate ids");
if (new Set(entries.map(({ route }) => route)).size !== entries.length) failures.push("manifest contains duplicate routes");

for (const project of entries.filter(({ api }) => api === "dedicated")) {
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
  const source = hasGitMetadata ? "Git worktree" : "archive tree";
  console.log(`Security scan passed: ${tracked.length} ${source} files, ${manifest.projects.length} tools, ${manifest.games.length} games, no committed secrets or dedicated direct-provider paths.`);
}
