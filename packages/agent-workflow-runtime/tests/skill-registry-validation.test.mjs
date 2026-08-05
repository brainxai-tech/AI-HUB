import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SkillRegistry } from "../src/skill-registry.mjs";

test("registry rejects invalid workflow versions and identifier arrays without leaking paths", async (t) => {
  const invalidWorkflows = [
    { label: "zero version", change: { version: 0 }, expected: /version/ },
    { label: "fractional version", change: { version: 1.5 }, expected: /version/ },
    { label: "string version", change: { version: "1" }, expected: /version/ },
    { label: "missing steps array", change: { steps: undefined }, expected: /steps/ },
    { label: "invalid step identifier", change: { steps: ["valid-step", "Not Valid"] }, expected: /steps/ },
    { label: "invalid checkpoint identifier", change: { checkpoints: [""] }, expected: /checkpoints/ },
    { label: "invalid actions type", change: { actions: "adjust-meal" }, expected: /actions/ },
  ];

  for (const { label, change, expected } of invalidWorkflows) {
    await t.test(label, async (t) => {
      const root = await skillRoot(t, change);
      await assert.rejects(
        () => new SkillRegistry(root).load(),
        (error) => {
          assert.match(error.message, expected);
          assert.equal(error.message.includes(root), false);
          return true;
        },
      );
    });
  }
});

async function skillRoot(t, workflowChange) {
  const root = await mkdtemp(path.join(tmpdir(), "aihub-skill-registry-"));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const skillDirectory = path.join(root, "sample-skill");
  await mkdir(path.join(skillDirectory, "scripts"), { recursive: true });
  const workflow = {
    id: "sample-workflow",
    version: 1,
    steps: ["start", "review-step"],
    checkpoints: ["review-step"],
    actions: [],
    ...workflowChange,
  };
  await writeFile(
    path.join(skillDirectory, "agent-skill.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "sample-skill",
      projectId: "sample-project",
      adapter: "scripts/adapter.mjs",
      workflow,
    }),
    "utf8",
  );
  await writeFile(path.join(skillDirectory, "SKILL.md"), "---\nname: sample-skill\n---\n", "utf8");
  await writeFile(
    path.join(skillDirectory, "scripts", "adapter.mjs"),
    "export const adapter = { async start() {} };\n",
    "utf8",
  );
  return root;
}
