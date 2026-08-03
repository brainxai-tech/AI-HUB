import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("agent workflow runtime is packaged, loopback-only, private, and not auto-enabled in production", async () => {
  const [manifest, unit, nginx, deploy] = await Promise.all([
    read("deploy/project-manifest.json").then(JSON.parse),
    read("deploy/systemd/ai-hub-agent-workflow.service"),
    read("deploy/nginx/idol-match-test.conf"),
    read("deploy/deploy.sh"),
  ]);
  assert.deepEqual(manifest.workflowApi, {
    package: "packages/agent-workflow-runtime",
    skills: "skills",
    port: 4196,
  });
  assert.match(unit, /Environment=HOST=127\.0\.0\.1/);
  assert.match(unit, /AIHUB_WORKFLOW_DATA_DIR=\/var\/lib\/ai-project-hub\/workflow-runs/);
  assert.match(unit, /ReadWritePaths=\/var\/lib\/ai-project-hub/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.match(unit, /NoNewPrivileges=true/);
  assert.doesNotMatch(nginx, /4196|agent-workflow/);
  assert.doesNotMatch(deploy, /ai-hub-agent-workflow/);
});
