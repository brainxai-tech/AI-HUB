import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const componentSource = readFileSync(join(process.cwd(), "components", "TarotSanctum.tsx"), "utf8");

test("theme selector exposes a clear selected state", () => {
  assert.match(componentSource, /aria-pressed=\{theme === "relationship"\}/);
  assert.match(componentSource, /aria-pressed=\{theme === "career"\}/);
  assert.match(componentSource, /className="theme-status"/);
});

test("theme switching clears the previous reading before a new draw", () => {
  const chooseThemeBody = componentSource.match(/function chooseTheme\(nextTheme: Theme\) \{([\s\S]*?)\n  \}/)?.[1];

  assert.ok(chooseThemeBody);
  assert.match(chooseThemeBody, /setReading\(null\)/);
  assert.match(chooseThemeBody, /setRitualState\("idle"\)/);
  assert.match(chooseThemeBody, /setHistoryMessage\(""\)/);
});

test("assessment uses Hub-backed AI generation without a user API key gate", () => {
  assert.match(componentSource, /const hasCompatibleApiConfig = true/);
  assert.match(componentSource, /LEGACY_CONFIG_STORAGE_KEYS/);
  assert.match(componentSource, /localStorage\.removeItem\(key\)/);
  assert.match(componentSource, /api\/compatible-reading/);
  assert.match(componentSource, /disabled=\{!canDraw\}/);
  assert.match(componentSource, /写下问题后可直接生成，无需额外设置/);
  assert.doesNotMatch(componentSource, /compatible-api-provider/);
  assert.doesNotMatch(componentSource, /请先接入 GPT、Gemini 或 Claude/);
});

test("AI generation exposes an accessible progress bar", () => {
  assert.match(componentSource, /generationProgress/);
  assert.match(componentSource, /MAX_ACTIVE_GENERATION_PROGRESS/);
  assert.match(componentSource, /AI 正在生成测评报告/);
  assert.match(componentSource, /role="progressbar"/);
  assert.match(componentSource, /aria-valuenow=\{generationProgress\}/);
});
