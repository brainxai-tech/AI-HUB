import { chmod, mkdir, open, readFile, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pm2ProjectIds = [
  "ai-life-villain-generator",
  "ai-parallel-universe-daily",
  "ai-tone-dressing-room",
  "ai-cooking-coach",
  "ai-counterfactual-life-simulator",
  "ai-one-person-board",
  "ai-anti-motivation-coach",
  "ai-misunderstanding-simulator",
];

export const clientProjectIds = [
  "ai-aesthetic-fingerprint",
  "ai-anti-motivation-coach",
  "ai-bedtime-story-factory",
  "ai-book-decomposer",
  "ai-cold-start-brand-lab",
  "ai-cooking-coach",
  "ai-counterfactual-life-simulator",
  "ai-course-teaching-assistant",
  "ai-data-analyst",
  "trace-sheet-workbench",
  "ai-dream-director",
  "ai-emotional-companion-local",
  "ai-english-theater",
  "ai-legal-clause-translator",
  "ai-life-version-controller",
  "ai-life-villain-generator",
  "ai-misunderstanding-simulator",
  "ai-one-person-board",
  "ai-paper-reading-coach",
  "ai-parallel-universe-daily",
  "ai-ppt-report-coach",
  "ai-reality-filter-translator",
  "ai-tarot-sanctum",
  "ai-tone-dressing-room",
  "ai-zhougong-dream",
  "ai-work-report-generator",
  "ai-essay-coach",
  "mbti-persona-compass",
  "yingzhou-ai",
  "elder-fraud-assistant",
  "idol-match-test",
  "qingqing-grassland-personality",
  "xhs-copywriting-master",
];

export function extractCredentials(pm2Dump) {
  if (!Array.isArray(pm2Dump)) throw new Error("PM2 dump must be an array.");
  const projects = {};
  for (const projectId of pm2ProjectIds) {
    const entry = pm2Dump.find((item) => item?.name === projectId);
    const token = entry?.HUB_PROJECT_TOKEN || entry?.env?.HUB_PROJECT_TOKEN;
    const storedProjectId = entry?.HUB_PROJECT_ID || entry?.env?.HUB_PROJECT_ID;
    if (storedProjectId !== projectId || typeof token !== "string" || token.length < 20) {
      throw new Error(`Scoped credential is missing for ${projectId}.`);
    }
    projects[projectId] = { token };
  }
  return { version: 1, projects };
}

function parseEnv(text) {
  const values = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function extractClientEnvCredentials(envFiles) {
  const projects = {};
  for (const projectId of clientProjectIds) {
    const values = parseEnv(envFiles?.[`${projectId}.env`]);
    const token = values.HUB_PROJECT_TOKEN;
    if (values.HUB_PROJECT_ID !== projectId || typeof token !== "string" || token.length < 20) {
      throw new Error(`Scoped client credential is missing for ${projectId}.`);
    }
    projects[projectId] = { token };
  }
  return { version: 1, projects };
}

async function readClientEnvDirectory(directoryPath) {
  const envFiles = {};
  for (const name of await readdir(directoryPath)) {
    if (!name.endsWith(".env")) continue;
    envFiles[name] = await readFile(path.join(directoryPath, name), "utf8");
  }
  return envFiles;
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o750 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const handle = await open(temporaryPath, "w", 0o640);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, 0o640);
  await rename(temporaryPath, filePath);
  await chmod(filePath, 0o640);
}

async function main() {
  const sourcePath = process.argv[2] || "/home/admin/.config/ai-project-hub/clients";
  const outputPath = process.argv[3] || "/etc/ai-project-hub/shared-static-pilot.json";
  const sourceStat = await stat(sourcePath);
  const credentials = sourceStat.isDirectory()
    ? extractClientEnvCredentials(await readClientEnvDirectory(sourcePath))
    : extractCredentials(JSON.parse(await readFile(sourcePath, "utf8")));
  await atomicWrite(outputPath, `${JSON.stringify(credentials, null, 2)}\n`);
  console.log(`Provisioned ${Object.keys(credentials.projects).length} scoped project credentials.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
