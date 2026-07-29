import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

describe("launch handoff", () => {
  it("ships a GitHub workflow that runs the full verification command", () => {
    const workflow = projectFile(".github/workflows/verify.yml");

    assert.ok(existsSync(workflow));
    const source = readFileSync(workflow, "utf8");
    assert.match(source, /npm ci/);
    assert.match(source, /npm run verify/);
  });

  it("documents production launch checks", () => {
    const handoff = projectFile("docs/production-handoff.md");

    assert.ok(existsSync(handoff));
    const source = readFileSync(handoff, "utf8");
    assert.match(source, /Launch Checklist/);
    assert.match(source, /15-question experience mode/);
    assert.match(source, /fallback mode still works/);
  });

  it("adds production verification commands to the README", () => {
    const source = readFileSync(projectFile("README.md"), "utf8");

    assert.match(source, /Production Verification/);
    assert.match(source, /npm ci/);
    assert.match(source, /npm run verify/);
  });
});
