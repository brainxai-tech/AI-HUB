import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDirectory, "..");
const defaultReleasePath = path.join(scriptsDirectory, "pikafish-release.json");
const defaultRuntimeDirectory = path.join(root, ".local-runtime", "engines");
const markerName = ".provisioned.json";

function safeSegment(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/.test(value)) {
    throw new Error(`Pikafish ${label} is invalid.`);
  }
  return value;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function existsFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function validateRelease(release) {
  if (release?.version !== 1 || !release.release || !release.upstream) {
    throw new Error("Pikafish release manifest is invalid.");
  }
  const { tag, asset, targets } = release.release;
  safeSegment(tag, "release tag");
  if (
    !asset ||
    typeof asset.name !== "string" ||
    typeof asset.url !== "string" ||
    !/^[a-f0-9]{64}$/i.test(asset.sha256 || "") ||
    !targets ||
    typeof targets !== "object" ||
    Array.isArray(targets)
  ) {
    throw new Error("Pikafish pinned asset metadata is invalid.");
  }
  const assetUrl = new URL(asset.url);
  const isLoopbackFixture =
    assetUrl.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(assetUrl.hostname);
  if (assetUrl.protocol !== "https:" && !isLoopbackFixture) {
    throw new Error("Pikafish asset URL must use HTTPS.");
  }
  return release;
}

export function selectPikafishTarget(release, platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const target = release?.release?.targets?.[key];
  if (!target || typeof target.executable !== "string") {
    throw new Error(`Unsupported Pikafish platform: ${platform} ${arch}.`);
  }
  const executable = target.executable.replace(/\\/g, "/");
  if (
    path.posix.isAbsolute(executable) ||
    executable.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Pikafish executable path is invalid for ${key}.`);
  }
  return { key, executable };
}

async function runExtractor(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} could not extract Pikafish (${stderr.trim() || `exit ${code}`}).`));
    });
  });
}

async function defaultExtractArchive(archivePath, extractionDirectory) {
  const candidates = process.platform === "linux"
    ? [
        ["7zz", ["x", "-y", `-o${extractionDirectory}`, archivePath]],
        ["7z", ["x", "-y", `-o${extractionDirectory}`, archivePath]],
        ["bsdtar", ["-xf", archivePath, "-C", extractionDirectory]],
      ]
    : [["tar", ["-xf", archivePath, "-C", extractionDirectory]]];
  const errors = [];
  for (const [command, args] of candidates) {
    try {
      await runExtractor(command, args);
      return;
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`Unable to extract the pinned Pikafish 7z archive. ${errors.join(" ")}`);
}

async function findByBasename(directory, basename, depth = 0) {
  if (depth > 6) return [];
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) matches.push(candidate);
    if (entry.isDirectory()) matches.push(...(await findByBasename(candidate, basename, depth + 1)));
  }
  return matches;
}

async function discoverExecutable(extractionDirectory, configuredRelativePath) {
  const expected = path.resolve(extractionDirectory, ...configuredRelativePath.split("/"));
  if (!isInside(extractionDirectory, expected)) {
    throw new Error("Pikafish executable resolved outside the extracted archive.");
  }
  if (await existsFile(expected)) return expected;
  const matches = await findByBasename(extractionDirectory, path.basename(configuredRelativePath));
  if (matches.length !== 1) {
    throw new Error(`Pikafish executable discovery found ${matches.length} candidates.`);
  }
  return matches[0];
}

async function readReusableEngine(destination, release, target) {
  try {
    const marker = await readJson(path.join(destination, markerName));
    if (
      marker.tag !== release.release.tag ||
      marker.assetSha256 !== release.release.asset.sha256.toLowerCase() ||
      marker.target !== target.key ||
      typeof marker.executableRelativePath !== "string" ||
      !/^[a-f0-9]{64}$/.test(marker.executableSha256 || "")
    ) {
      return null;
    }
    const enginePath = path.resolve(destination, marker.executableRelativePath);
    if (!isInside(destination, enginePath) || !(await existsFile(enginePath))) return null;
    if ((await hashFile(enginePath)) !== marker.executableSha256) return null;
    return enginePath;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function activateDirectory(stagingDirectory, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const backup = `${destination}.backup-${process.pid}-${randomBytes(5).toString("hex")}`;
  let backedUp = false;
  try {
    await rename(destination, backup);
    backedUp = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(stagingDirectory, destination);
  } catch (error) {
    if (backedUp) await rename(backup, destination);
    throw error;
  }
  if (backedUp) await rm(backup, { recursive: true, force: true });
}

async function downloadAsset(url, fetcher) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: { "user-agent": "AI-HUB-Pikafish-Provisioner/1" },
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        const error = new Error(`Pikafish download failed with HTTP ${response.status}.`);
        if (response.status >= 400 && response.status < 500) throw error;
        lastError = error;
      } else {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch (error) {
      lastError = error;
      if (/HTTP 4\d\d/.test(error.message || "")) throw error;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw new Error(`Pikafish download failed after 3 attempts: ${lastError?.message || "unknown error"}`);
}

async function downloadAssetWithPowerShell(url, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Headers @{ 'User-Agent'='AI-HUB-Pikafish-Provisioner/1' } -Uri $env:AIHUB_PIKAFISH_URL -OutFile $env:AIHUB_PIKAFISH_OUTPUT",
      ],
      {
        env: {
          ...process.env,
          AIHUB_PIKAFISH_URL: url,
          AIHUB_PIKAFISH_OUTPUT: outputPath,
        },
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell could not download Pikafish (${stderr.trim() || `exit ${code}`}).`));
    });
  });
}

async function downloadPinnedAsset(url, archivePath, fetcher) {
  if (fetcher) return downloadAsset(url, fetcher);
  if (process.platform === "win32") {
    await downloadAssetWithPowerShell(url, archivePath);
    return readFile(archivePath);
  }
  return downloadAsset(url, fetch);
}

export async function provisionPikafish(options = {}) {
  const releasePath = path.resolve(options.releasePath || defaultReleasePath);
  const runtimeDirectory = path.resolve(options.runtimeDirectory || defaultRuntimeDirectory);
  const release = validateRelease(await readJson(releasePath));
  const target = selectPikafishTarget(release, options.platform, options.arch);
  const destination = path.join(
    runtimeDirectory,
    "pikafish",
    safeSegment(release.release.tag, "release tag"),
    safeSegment(target.key, "target"),
  );
  const reusable = await readReusableEngine(destination, release, target);
  if (reusable) {
    return { enginePath: reusable, reused: true, tag: release.release.tag, target: target.key };
  }

  const engineRoot = path.join(runtimeDirectory, "pikafish");
  await mkdir(engineRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(engineRoot, ".provision-"));
  const archivePath = path.join(temporaryDirectory, release.release.asset.name);
  const extractionDirectory = path.join(temporaryDirectory, "extracted");
  try {
    const bytes = await downloadPinnedAsset(
      release.release.asset.url,
      archivePath,
      options.fetcher,
    );
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== release.release.asset.sha256.toLowerCase()) {
      throw new Error(`Pikafish SHA-256 mismatch: expected ${release.release.asset.sha256}, received ${digest}.`);
    }
    await writeFile(archivePath, bytes);
    await mkdir(extractionDirectory, { recursive: true });
    await (options.extractArchive || defaultExtractArchive)(archivePath, extractionDirectory);
    const discoveredPath = await discoverExecutable(extractionDirectory, target.executable);
    if ((options.platform || process.platform) !== "win32") await chmod(discoveredPath, 0o755);
    const executableRelativePath = path.relative(extractionDirectory, discoveredPath);
    const executableSha256 = await hashFile(discoveredPath);
    await writeFile(
      path.join(extractionDirectory, markerName),
      `${JSON.stringify({
        version: 1,
        tag: release.release.tag,
        target: target.key,
        asset: release.release.asset.name,
        assetSha256: release.release.asset.sha256.toLowerCase(),
        executableRelativePath,
        executableSha256,
        upstream: release.upstream.homepage,
        license: release.upstream.license,
        licenseUrl: release.upstream.licenseUrl,
      }, null, 2)}\n`,
      "utf8",
    );
    await activateDirectory(extractionDirectory, destination);
    return {
      enginePath: path.join(destination, executableRelativePath),
      reused: false,
      tag: release.release.tag,
      target: target.key,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await provisionPikafish({
    releasePath: argument("release") || defaultReleasePath,
    runtimeDirectory: argument("runtime") || defaultRuntimeDirectory,
  });
  console.log(`${result.reused ? "Reused" : "Provisioned"} ${result.tag} for ${result.target}: ${result.enginePath}`);
}
