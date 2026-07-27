import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArguments(process.argv.slice(2));
const projectsPath = path.resolve(options.projects || path.join(root, "public", "projects.js"));
const sourceDir = path.resolve(options.source || path.join(root, "cover-source"));
const outputDir = path.resolve(
  options.output || path.join(root, "public", "assets", "project-covers", "generated"),
);
const manifestPath = path.resolve(options.manifest || path.join(root, "public", "cover-manifest.js"));
const python = options.python || process.env.COVER_PYTHON || "python";
const helperPath = path.join(root, "scripts", "optimize-covers.py");
const inputPath = path.join(outputDir, ".cover-build-input.json");
const resultPath = path.join(outputDir, ".cover-build-result.json");

await mkdir(outputDir, { recursive: true });
const sandbox = { window: {} };
vm.runInNewContext(await readFile(projectsPath, "utf8"), sandbox, { filename: projectsPath });
const projects = Array.isArray(sandbox.window.AI_PROJECTS) ? sandbox.window.AI_PROJECTS : [];
const inputs = projects.map((project) => {
  const url = new URL(String(project.image || ""), "http://localhost");
  return { id: project.id, source: path.basename(url.pathname) };
});
await writeFile(inputPath, `${JSON.stringify({ projects: inputs }, null, 2)}\n`, "utf8");

try {
  await run(python, [
    helperPath,
    "--input",
    inputPath,
    "--source-dir",
    sourceDir,
    "--output-dir",
    outputDir,
    "--result",
    resultPath,
  ]);
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const manifest = `window.AI_PROJECT_COVERS = Object.freeze(${JSON.stringify(result, null, 2)});\n`;
  await writeFile(manifestPath, manifest, "utf8");

  const variants = Object.values(result).flatMap((cover) => [...cover.avif, ...cover.webp]);
  const totalBytes = variants.reduce((sum, variant) => sum + variant.bytes, 0);
  console.log(`optimized ${Object.keys(result).length} covers into ${variants.length} variants (${totalBytes} bytes)`);
} finally {
  await rm(inputPath, { force: true });
  await rm(resultPath, { force: true });
}

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument: ${key}`);
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}
