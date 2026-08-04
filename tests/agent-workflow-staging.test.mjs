import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("agent workflow runtime is packaged, loopback-only, private, and activated atomically in production", async () => {
  const [manifest, hubUnit, workflowUnit, nginx, deploy] = await Promise.all([
    read("deploy/project-manifest.json").then(JSON.parse),
    read("deploy/systemd/ai-project-hub.service"),
    read("deploy/systemd/ai-hub-agent-workflow.service"),
    read("deploy/nginx/idol-match-test.conf"),
    read("deploy/deploy.sh"),
  ]);
  assert.deepEqual(manifest.workflowApi, {
    package: "packages/agent-workflow-runtime",
    skills: "skills",
    port: 4196,
  });
  assert.match(workflowUnit, /^Environment=HOST=127\.0\.0\.1$/m);
  assert.match(workflowUnit, /^Environment=PORT=4196$/m);
  assert.match(workflowUnit, /^Environment=AIHUB_WORKFLOW_DATA_DIR=\/var\/lib\/ai-project-hub\/workflow-runs$/m);
  assert.match(workflowUnit, /^EnvironmentFile=\/etc\/ai-project-hub\/agent-workflow\.env$/m);
  assert.doesNotMatch(workflowUnit, /^EnvironmentFile=-/m);
  assert.match(workflowUnit, /^ReadWritePaths=\/var\/lib\/ai-project-hub$/m);
  assert.match(workflowUnit, /^ProtectSystem=strict$/m);
  assert.match(workflowUnit, /^NoNewPrivileges=true$/m);
  assert.match(hubUnit, /^EnvironmentFile=-\/etc\/ai-project-hub\/agent-workflow\.env$/m);

  for (const requirement of [
    'HUB_UNIT_FILE="/etc/systemd/system/ai-project-hub.service"',
    'WORKFLOW_UNIT_FILE="/etc/systemd/system/ai-hub-agent-workflow.service"',
    'WORKFLOW_ENV_FILE="/etc/ai-project-hub/agent-workflow.env"',
    'WORKFLOW_DATA_DIR="/var/lib/ai-project-hub/workflow-runs"',
    'WORKFLOW_HEALTH_URL="http://127.0.0.1:4196/health"',
    'install -d -m 0700 -o admin -g admin "$WORKFLOW_DATA_DIR"',
    'install -m 0640 -o root -g admin "$temporary" "$WORKFLOW_ENV_FILE"',
    'systemctl restart ai-project-hub',
    'systemctl restart ai-hub-agent-workflow',
  ]) {
    assert.match(deploy, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(deploy, /openssl rand -hex 32/);
  assert.match(deploy, /Authorization: Bearer/);
  assert.match(deploy, /backup_dir\/ai-hub-agent-workflow\.service/);
  assert.match(deploy, /restore_service_states/);
  assert.match(deploy, /prepare_release_dependencies/);
  assert.match(deploy, /cmp -s -- "\$lock" "\$candidate_lock"/);
  assert.match(deploy, /resolved_modules.*RELEASES_DIR/s);
  assert.match(deploy, /runuser -u admin -- env npm_config_cache="\$release\/\.npm-cache"[\s\\]*npm ci --no-audit --no-fund/);
  assert.match(deploy, /npm run workspace:build/);
  assert.match(deploy, /npm run workspace:verify/);
  assert.match(deploy, /snapshot_trusted_release_files/);
  assert.match(deploy, /restore_trusted_release_files/);
  assert.match(deploy, /AIHUB_SCAN_ROOT="\$temporary"/);
  assert.match(deploy, /AIHUB_SCAN_MANIFEST="\$trusted\/deploy\/project-manifest\.json"/);
  assert.match(deploy, /node "\$trusted\/scripts\/security-scan\.mjs"/);
  assert.match(deploy, /chown root:root "\$release"/);
  assert.ok(
    deploy.indexOf(`printf '%s\\n' "$commit" > "$temporary/.release-commit"`) > deploy.indexOf('restore_trusted_release_files "$temporary" "$trusted"'),
    "release commit marker must be written only after the build-writable tree is returned to root control",
  );
  assert.match(deploy, /\.dependency-releases/);
  assert.match(deploy, /chown -hR admin:admin "\$temporary"/);
  assert.match(deploy, /runuser -u admin -- env npm_config_cache=/);
  assert.match(deploy, /if \[\[ -n "\$seed" \]\]/);
  assert.match(deploy, /systemctl show --property=LoadState --value ai-hub-agent-workflow/);
  assert.doesNotMatch(deploy, /systemctl disable --now ai-hub-agent-workflow[^\n]*\|\| true/);
  assert.match(deploy, /systemctl is-active --quiet ai-hub-agent-workflow[\s\S]*workflow service is still active/);
  assert.doesNotMatch(nginx, /4196|agent-workflow/);
});
