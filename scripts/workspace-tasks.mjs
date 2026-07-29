import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "deploy/project-manifest.json"), "utf8"));
const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmArgumentPrefix = process.platform === "win32" ? [resolveWindowsNpmCli()] : [];
const command = process.argv[2] || "check";

const packages = [
  { id: "shared-project-runtime", directory: path.join(root, manifest.sharedApi.package), route: "", stack: "shared" },
  ...manifest.projects.map((project) => ({
    ...project,
    directory: path.join(root, project.source),
  })),
];

if (command === "install") {
  installPackage(root, "root");
  for (const item of packages) installPackage(item.directory, item.id);
} else if (command === "build") {
  for (const item of packages.filter(({ stack }) => stack === "next" || stack === "vite")) {
    runNpm(item, "build");
  }
  checkBuilds();
} else if (command === "verify") {
  runNpm({ id: "hub", directory: root, route: "", stack: "hub" }, "verify");
  runNpm(packages[0], "verify");
  for (const item of packages.slice(1)) runNpm(item, "verify");
  checkBuilds();
} else if (command === "check") {
  checkBuilds();
} else {
  throw new Error(`Unknown workspace command: ${command}`);
}

function installPackage(directory, id) {
  const packagePath = path.join(directory, "package.json");
  if (!existsSync(packagePath)) throw new Error(`Missing package.json for ${id}`);
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const hasDependencies = Object.keys(packageJson.dependencies || {}).length > 0 || Object.keys(packageJson.devDependencies || {}).length > 0;
  const hasLock = existsSync(path.join(directory, "package-lock.json"));
  if (!hasLock && !hasDependencies) {
    console.log(`[install] ${id}: no dependencies`);
    return;
  }
  if (!hasLock) throw new Error(`${id} has dependencies but no package-lock.json`);
  run(npmCommand, [...npmArgumentPrefix, "ci", "--no-audit", "--no-fund"], directory, `[install] ${id}`);
}

function runNpm(item, script) {
  run(npmCommand, [...npmArgumentPrefix, "run", script], item.directory, `[${script}] ${item.id}`, projectEnvironment(item));
}

function resolveWindowsNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    ...String(process.env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, "node_modules", "npm", "bin", "npm-cli.js")),
  ];
  const npmCli = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!npmCli) throw new Error("Unable to locate npm-cli.js for the current Node.js installation.");
  return npmCli;
}

function projectEnvironment(item) {
  const route = item.route ? item.route.replace(/\/$/, "") : "";
  return {
    ...process.env,
    ...(route ? {
      BASE_PATH: route,
      NEXT_PUBLIC_BASE_PATH: route,
      VITE_BASE_PATH: `${route}/`,
    } : {}),
  };
}

function run(executable, args, cwd, label, env = process.env) {
  console.log(`\n${label}`);
  const result = spawnSync(executable, args, { cwd, env, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

function checkBuilds() {
  const missing = [];
  for (const item of packages.slice(1)) {
    const expected = item.stack === "next"
      ? path.join(item.directory, ".next", "BUILD_ID")
      : item.stack === "node-static"
        ? path.join(item.directory, "public", "index.html")
        : path.join(item.directory, "dist", "index.html");
    if (!existsSync(expected)) missing.push(`${item.id}: ${path.relative(root, expected)}`);
  }
  for (const item of packages.filter(({ api }) => api === "dedicated")) {
    const server = path.join(item.directory, "dist-server", "server", "index.js");
    if (!existsSync(server)) missing.push(`${item.id}: ${path.relative(root, server)}`);
  }
  if (missing.length) throw new Error(`Missing workspace runtime artifacts:\n${missing.join("\n")}`);
  console.log(`\nWorkspace runtime artifacts ready: ${manifest.projects.length} non-game projects.`);
}
