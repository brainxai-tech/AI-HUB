import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildBundle } from "../scripts/build-idol-profiles.mjs";

describe("idol profile bundle generation", () => {
  it("prefers the current project knowledge base before older workspace copies", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "idol-workspace-"));
    const projectRoot = join(workspaceRoot, "01-Projects", "ai-idol-match-test-deploy");
    const oldProjectRoot = join(workspaceRoot, "01-Projects", "idol-match-test");
    const knowledgeDir = join(projectRoot, "knowledge-base");
    const oldKnowledgeDir = join(oldProjectRoot, "knowledge-base");

    mkdirSync(knowledgeDir, { recursive: true });
    mkdirSync(oldKnowledgeDir, { recursive: true });

    writeFileSync(
      join(knowledgeDir, "年轻向全球idol资料清单_120plus.md"),
      "| 序号 | 姓名 | 资料 |\n| --- | --- | --- |\n| 1 | 本项目爱豆 | 舞台 live 稳定，粉丝互动自然。 |",
      "utf8"
    );
    writeFileSync(
      join(oldKnowledgeDir, "年轻向全球idol资料清单_120plus.md"),
      "| 序号 | 姓名 | 资料 |\n| --- | --- | --- |\n| 1 | 旧项目爱豆 | 旧资料，不应优先显示。 |",
      "utf8"
    );

    const bundle = buildBundle({ projectRoot, workspaceRoot });

    assert.equal(bundle.status.mode, "rag");
    assert.equal(bundle.profiles[0].name, "本项目爱豆");
    assert.match(bundle.status.sourceLabel, /ai-idol-match-test-deploy/);
    assert.doesNotMatch(bundle.status.sourceLabel, /01-Projects\/idol-match-test\/knowledge-base/);
  });
});
