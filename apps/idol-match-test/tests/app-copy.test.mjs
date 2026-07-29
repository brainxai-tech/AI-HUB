import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/IdolMatchTest.tsx", import.meta.url), "utf8");

describe("app handoff copy", () => {
  it("uses product naming that covers both quiz modes", () => {
    assert.match(layoutSource, /title:\s*"爱豆匹配测试"/);
    assert.doesNotMatch(layoutSource, /title:\s*"40题爱豆匹配测试"/);
  });

  it("documents the experience and professional quiz modes", () => {
    assert.match(readmeSource, /体验版[\s\S]*15题/);
    assert.match(readmeSource, /专业版[\s\S]*40题/);
  });

  it("surfaces match diagnostics on the result page", () => {
    assert.match(componentSource, /MATCH MAP/);
    assert.match(componentSource, /dimensionScores/);
    assert.match(componentSource, /dimension-track/);
  });

  it("offers a copyable share result action", () => {
    assert.match(componentSource, /buildShareText/);
    assert.match(componentSource, /复制结果/);
    assert.match(componentSource, /下载海报/);
    assert.match(componentSource, /share-poster/);
  });

  it("uses Hub-backed smart analysis without a user API key gate", () => {
    assert.match(componentSource, /智能分析自动准备/);
    assert.match(componentSource, /无需额外设置/);
    assert.match(componentSource, /deepSeekConnectionStatus[\s\S]*"connected"/);
    assert.match(componentSource, /disabled=\{deepSeekResultStatus === "loading"\}/);
    assert.doesNotMatch(componentSource, /connectDeepSeek/);
    assert.doesNotMatch(componentSource, /compatible-api-provider/);
  });

  it("surfaces result growth features for comparison, entry path, and history", () => {
    assert.match(componentSource, /displayTopMatches/);
    assert.match(componentSource, /entry-path-inline/);
    assert.match(componentSource, /entry-card-list/);
    assert.match(componentSource, /收藏与历史/);
    assert.match(componentSource, /toggleCurrentFavorite/);
  });

  it("locks the idol match locally and uses Hub-backed analysis copy", () => {
    assert.match(componentSource, /generateDeepSeekMatchResult/);
    assert.match(componentSource, /api\/compatible-result/);
    assert.match(componentSource, /fixedIdolId/);
    assert.match(componentSource, /固定匹配/);
  });
});
