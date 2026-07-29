import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("systemd unit limits writes and restart storms", async () => {
  const unit = await readFile(new URL("../deploy/systemd/ai-project-hub.service", import.meta.url), "utf8");

  for (const directive of [
    "Restart=on-failure",
    "StartLimitBurst=5",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "ProtectSystem=strict",
    "ProtectHome=read-only",
    "ReadWritePaths=/var/lib/ai-project-hub /var/log/ai-project-hub",
    "UMask=0077",
  ]) {
    assert.match(unit, new RegExp(`^${directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
  assert.doesNotMatch(unit, /Restart=always/);
});

test("logrotate bounds observability retention and preserves private mode", async () => {
  const config = await readFile(new URL("../deploy/logrotate/ai-project-hub", import.meta.url), "utf8");

  assert.match(config, /^\s*maxsize 20M$/m);
  assert.match(config, /^\s*rotate 14$/m);
  assert.match(config, /^\s*create 0600 admin admin$/m);
});

test("Nginx caches fingerprinted cover variants immutably while HTML stays uncached", async () => {
  const config = await readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8");

  assert.match(config, /project-covers\/generated/);
  assert.match(config, /max-age=31536000, immutable/);
  assert.match(config, /location = \/hub\//);
  assert.match(config, /no-cache, no-store, must-revalidate/);
  assert.match(config, /location = \/hub\/suite-shell\.js/);
  assert.match(config, /no-cache, must-revalidate/);
});

test("Nginx exposes centralized administration while application token auth protects writes", async () => {
  const config = await readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8");
  const modelConfigStart = config.indexOf("location = /hub/api/model-config {");
  const adminStart = config.indexOf("location ^~ /hub/admin/ {");
  const modelConfigEnd = config.indexOf("\n    location ", modelConfigStart + 1);
  const adminEnd = config.indexOf("\n    location ", adminStart + 1);

  assert.ok(modelConfigStart > -1, "model configuration proxy is missing");
  assert.ok(adminStart > -1, "administrator UI location is missing");
  assert.doesNotMatch(config.slice(modelConfigStart, modelConfigEnd), /limit_except GET/);
  assert.doesNotMatch(config.slice(adminStart, adminEnd), /deny all/);
  assert.match(config, /HUB_ADMIN_TOKEN can authorize them centrally/);
  assert.match(config, /configuration write[\s\S]*protected by HUB_ADMIN_TOKEN/);
});

test("release deployment is atomic, secret-free, and health checked", async () => {
  const script = await readFile(new URL("../deploy/deploy.sh", import.meta.url), "utf8");

  for (const requirement of [
    'APP_ROOT="/opt/ai-project-hub"',
    'RELEASES_DIR="$APP_ROOT/releases"',
    'CURRENT_LINK="$APP_ROOT/current"',
    "npm run verify",
    "mv -Tf",
    "curl --fail",
    "rollback_deployment",
    'wait_for_health "$RESTORE_LOCAL_HEALTH_URL"',
    'wait_for_health "$RESTORE_PUBLIC_HEALTH_URL"',
    'ENV_DIR="/etc/ai-project-hub"',
    'ENV_FILE="$ENV_DIR/ai-project-hub.env"',
    'PROJECT_TOKEN_REGISTRY="/var/lib/ai-project-hub/project-tokens.json"',
    'LEGACY_PROJECT_TOKEN_REGISTRY="/home/admin/apps/ai-project-hub/data/project-tokens.json"',
    'install -m 0600 -o admin -g admin "$LEGACY_PROJECT_TOKEN_REGISTRY" "$PROJECT_TOKEN_REGISTRY"',
  ]) {
    assert.match(script, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(script, /\$release\/\.env/);
  assert.match(script, /\$release\/data/);
  assert.match(script, /\$release\/backups/);
});

test("rollback activates a retained release through the same health gate", async () => {
  const script = await readFile(new URL("../deploy/rollback.sh", import.meta.url), "utf8");

  assert.match(script, /APP_ROOT="\/opt\/ai-project-hub"/);
  assert.match(script, /PREVIOUS_LINK="\$APP_ROOT\/previous"/);
  assert.match(script, /--activate/);
  assert.match(script, /deploy\.sh/);
});

test("service and Hub static files resolve through the current release", async () => {
  const [unit, nginx] = await Promise.all([
    readFile(new URL("../deploy/systemd/ai-project-hub.service", import.meta.url), "utf8"),
    readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8"),
  ]);

  assert.match(unit, /^WorkingDirectory=\/opt\/ai-project-hub\/current$/m);
  assert.match(unit, /^EnvironmentFile=\/etc\/ai-project-hub\/ai-project-hub\.env$/m);
  assert.match(unit, /^Environment=HUB_PROJECT_TOKENS_PATH=\/var\/lib\/ai-project-hub\/project-tokens\.json$/m);
  assert.match(unit, /^ExecStart=\/usr\/bin\/node \/opt\/ai-project-hub\/current\/server\.mjs$/m);
  assert.match(unit, /^ReadOnlyPaths=\/opt\/ai-project-hub$/m);
  assert.match(nginx, /\/opt\/ai-project-hub\/current\/public/);
});

test("local Hub server sends modern project covers with image MIME types", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(server, /\["\.webp", "image\/webp"\]/);
  assert.match(server, /\["\.avif", "image\/avif"\]/);
  assert.match(server, /"x-content-type-options": "nosniff"/);
});
