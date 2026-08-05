import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMockProfiles,
  extractProfilesFromMarkdown
} from "./profile-builder.mjs";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkspaceRoot = resolve(defaultProjectRoot, "..", "..");
const defaultOutputFile = join(defaultProjectRoot, "data", "idol-profiles.generated.ts");
const searchedHints = [
  "knowledge-base/年轻向全球idol资料清单_120plus.md",
  "工作区内包含“明星对话”的 Markdown/TXT/JSON",
  "工作区内包含“idol资料”或“120plus”的 Markdown"
];

const skippedDirectories = new Set([
  ".git",
  ".next",
  ".npm-cache",
  ".appdata",
  ".superpowers",
  "node_modules",
  "dist",
  "build"
]);

const candidateNamePatterns = [
  /年轻向全球.*idol.*120plus.*\.(md|txt|json)$/i,
  /明星对话.*\.(md|txt|json)$/i,
  /idol资料.*\.(md|txt|json)$/i,
  /120plus.*\.(md|txt|json)$/i
];

const isCandidateFile = (filePath) => {
  const name = basename(filePath);
  return candidateNamePatterns.some((pattern) => pattern.test(name));
};

const findCandidateFiles = (root, maxDepth = 7) => {
  const results = [];

  const walk = (dir, depth) => {
    if (depth > maxDepth || !existsSync(dir)) {
      return;
    }

    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) {
          walk(entryPath, depth + 1);
        }
        continue;
      }

      if (entry.isFile() && isCandidateFile(entryPath)) {
        results.push(entryPath);
      }
    }
  };

  walk(root, 0);
  return results;
};

const parseSourceFile = (filePath, workspaceRoot) => {
  const raw = readFileSync(filePath, "utf8");
  const extension = extname(filePath).toLowerCase();
  const source = relative(workspaceRoot, filePath).replace(/\\/g, "/");

  if (extension === ".json") {
    try {
      return extractProfilesFromMarkdown(JSON.stringify(JSON.parse(raw), null, 2), source);
    } catch {
      return extractProfilesFromMarkdown(raw, source);
    }
  }

  return extractProfilesFromMarkdown(raw, source);
};

export const buildBundle = ({
  projectRoot = defaultProjectRoot,
  workspaceRoot = defaultWorkspaceRoot
} = {}) => {
  const directRagFile = join(projectRoot, "knowledge-base", "年轻向全球idol资料清单_120plus.md");
  const files = existsSync(directRagFile) ? [directRagFile] : findCandidateFiles(workspaceRoot);
  const uniqueFiles = [...new Set(files)];
  const profiles = new Map();

  for (const file of uniqueFiles) {
    for (const profile of parseSourceFile(file, workspaceRoot)) {
      if (!profiles.has(profile.name)) {
        profiles.set(profile.name, profile);
      }
    }
  }

  const extractedProfiles = [...profiles.values()];
  if (extractedProfiles.length > 0) {
    return {
      status: {
        mode: "rag",
        sourceLabel: uniqueFiles.map((file) => relative(workspaceRoot, file).replace(/\\/g, "/")).join(" + "),
        message: `已从工作区知识库提取 ${extractedProfiles.length} 位候选爱豆。`,
        searchedHints
      },
      profiles: extractedProfiles
    };
  }

  return {
    status: {
      mode: "mock",
      sourceLabel: "mock demo fallback",
      message:
        "未在当前可读工作区找到“年轻向全球idol资料清单_120plus.md”或“明星对话”资料，已启用本地 mock 候选库用于演示。",
      searchedHints
    },
    profiles: buildMockProfiles()
  };
};

export const writeBundle = (bundle, outputFile = defaultOutputFile) => {
  mkdirSync(dirname(outputFile), { recursive: true });
  const content = `import type { IdolDataBundle } from "../lib/types";

export const idolDataBundle: IdolDataBundle = ${JSON.stringify(bundle, null, 2)};
`;

  writeFileSync(outputFile, content, "utf8");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bundle = buildBundle();
  writeBundle(bundle);
  console.log(`${bundle.status.message} 候选库文件：${relative(defaultProjectRoot, defaultOutputFile)}`);
}
