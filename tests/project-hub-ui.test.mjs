import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), "utf8");

test("workflow center is an administrator-gated external-script application", async () => {
  const [home, html, script] = await Promise.all([
    read("public/index.html"),
    read("public/workflows/index.html"),
    read("public/workflows/workflows.js"),
  ]);

  assert.match(home, /href="\/hub\/workflows\/">工作流控制台/);
  assert.match(html, /id="unlockForm"/);
  assert.match(html, /id="adminTokenInput"[^>]*type="password"/s);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /SSH 隧道/);
  assert.match(html, /默认保留 30 天/);
  assert.match(html, /原始单元格始终留在浏览器/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i);
  assert.match(script, /let adminToken = ""/);
  assert.doesNotMatch(script, /localStorage/);
  assert.doesNotMatch(script, /sessionStorage\.setItem\([^\n]*(?:admin|token)/i);
});

test("workflow center supports all six forms and the complete run lifecycle", async () => {
  const script = await read("public/workflows/workflows.js");
  for (const skillId of [
    "coach-chinese-essay",
    "plan-weekly-meals",
    "read-research-paper",
    "build-course-pack",
    "review-legal-clause",
    "operate-trace-sheet",
  ]) {
    assert.match(script, new RegExp(`"${skillId}"`));
  }
  for (const operation of ["createRun", "getRun", "resumeRun", "retryRun", "actionRun", "deleteRun"]) {
    assert.match(script, new RegExp(`function ${operation}|const ${operation}`));
  }
  assert.match(script, /textField\("profile\.pantry"/);
  assert.doesNotMatch(script, /profile\.availableIngredients/);
  assert.doesNotMatch(script, /textField\("constraints"[^\n]*transform: "json"/);
  assert.match(script, /await loadAvailableSkills\(\)/);
  assert.doesNotMatch(script, /hubRequest\("\/hub\/api\/admin\/verify"/);
  assert.match(script, /sessionStorage\.setItem\(RECENT_RUNS_KEY/);
  assert.match(script, /\.textContent\s*=/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});
