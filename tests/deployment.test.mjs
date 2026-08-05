import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release shell scripts are exported with Unix line endings", async () => {
  const attributes = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");

  assert.match(attributes, /^apps\/idol-match-test\/data\/idol-profiles\.generated\.ts text eol=lf$/m);
  assert.match(attributes, /^\*\.sh text eol=lf$/m);
});

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

test("Nginx exposes all unified game routes with safe cache and API boundaries", async () => {
  const config = await readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8");

  for (const [route, port] of [
    ["xiangqi", 13542],
    ["chess", 13543],
    ["go", 13544],
  ]) {
    assert.match(config, new RegExp(`location = \\/${route} \\{\\s*return 301 \\/${route}\\/;`));
    assert.match(
      config,
      new RegExp(`location \\/${route}\\/ \\{[\\s\\S]*?proxy_pass http:\\/\\/127\\.0\\.0\\.1:${port}`),
    );
  }

  assert.match(config, /location = \/fury-flock \{\s*return 301 \/fury-flock\/;/);
  assert.match(config, /location = \/fury-flock\/ \{[\s\S]*?try_files \/index\.html =404;[\s\S]*?no-cache, no-store, must-revalidate/);
  assert.match(config, /location ~\* "\^\/fury-flock\/\(assets\/.+" \{[\s\S]*?max-age=31536000, immutable/);
  assert.match(config, /location \/fury-flock\/ \{[\s\S]*?try_files \$uri \$uri\/ \/fury-flock\/index\.html;/);

  assert.match(config, /location = \/hub\/dice-estate\/ \{[\s\S]*?try_files \/dice-estate\/index\.html =404;[\s\S]*?no-cache, no-store, must-revalidate/);
  assert.match(config, /location = \/hub\/dice-estate\/index\.html \{[\s\S]*?no-cache, no-store, must-revalidate/);
  assert.match(config, /location = \/api\/agent\/decision \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4194;/);
});

test("imported products use hardened release-scoped services and dedicated routes", async () => {
  const products = [
    { id: "mbti-persona-compass", route: "mbti", port: 4203 },
    { id: "ai-essay-coach", route: "essay", port: 4204 },
    { id: "yingzhou-ai", route: "poetry", port: 4205 },
  ];
  const nginx = await readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8");

  for (const { id, route, port } of products) {
    const unit = await readFile(new URL(`../deploy/systemd/${id}.service`, import.meta.url), "utf8");
    for (const directive of [
      "Restart=on-failure",
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      "ProtectSystem=strict",
      "ProtectHome=read-only",
      "UMask=0077",
    ]) {
      assert.match(unit, new RegExp(`^${directive}$`, "m"), `${id} is missing ${directive}`);
    }
    assert.match(unit, new RegExp(`^WorkingDirectory=/opt/ai-project-hub/current/apps/${id}$`, "m"));
    assert.match(unit, new RegExp(`^Environment=PORT=${port}$`, "m"));
    assert.match(unit, new RegExp(`^EnvironmentFile=/home/admin/\\.config/ai-project-hub/clients/${id}\\.env$`, "m"));
    assert.match(unit, new RegExp(`^ExecStart=/usr/bin/node /opt/ai-project-hub/current/apps/${id}/dist-server/server/index\\.js --prod$`, "m"));
    assert.match(nginx, new RegExp(`location = /${route} \\{\\s*return 301 /${route}/;`));
    assert.match(nginx, new RegExp(`location \\^~ /${route}/ \\{[\\s\\S]*?proxy_pass http://127\\.0\\.0\\.1:${port};`));
  }
});

test("Nginx no longer exposes the removed legacy administration page", async () => {
  const config = await readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8");
  const modelConfigStart = config.indexOf("location = /hub/api/model-config {");
  const modelConfigEnd = config.indexOf("\n    location ", modelConfigStart + 1);

  assert.ok(modelConfigStart > -1, "model configuration proxy is missing");
  assert.doesNotMatch(config.slice(modelConfigStart, modelConfigEnd), /limit_except GET/);
  assert.doesNotMatch(config, /location = \/hub\/admin\b/);
  assert.doesNotMatch(config, /location \^~ \/hub\/admin\//);
  assert.match(config, /HUB_ADMIN_TOKEN can authorize them centrally/);
  assert.match(config, /Single-purpose credential configuration UI[\s\S]*write remains protected[\s\S]*by HUB_ADMIN_TOKEN/);
});

test("release deployment is atomic, secret-free, and health checked", async () => {
  const script = await readFile(new URL("../deploy/deploy.sh", import.meta.url), "utf8");

  for (const requirement of [
    'APP_ROOT="/opt/ai-project-hub"',
    'RELEASES_DIR="$APP_ROOT/releases"',
    'CURRENT_LINK="$APP_ROOT/current"',
    "npm run workspace:build",
    "npm run workspace:verify",
    "snapshot_trusted_release_files",
    "restore_trusted_release_files",
    'AIHUB_SCAN_ROOT="$temporary"',
    'AIHUB_SCAN_MANIFEST="$trusted/deploy/project-manifest.json"',
    'node "$trusted/scripts/security-scan.mjs"',
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
    'WORKFLOW_ENV_FILE="/etc/ai-project-hub/agent-workflow.env"',
    'WORKFLOW_DATA_DIR="/var/lib/ai-project-hub/workflow-runs"',
    'WORKFLOW_HEALTH_URL="http://127.0.0.1:4196/health"',
    'install -d -m 0700 -o admin -g admin "$WORKFLOW_DATA_DIR"',
    'systemctl enable ai-project-hub ai-hub-agent-workflow',
    'wait_for_workflow_health',
    'restore_service_states',
  ]) {
    assert.match(script, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(script, /\$release\/\.env/);
  assert.match(script, /\$release\/data/);
  assert.match(script, /\$release\/backups/);
  assert.match(script, /\^data\(\/\|\$\)/);
  assert.match(script, /\^backups\(\/\|\$\)/);
  assert.doesNotMatch(script, /\(\^\|\/\)data\(\/\|\$\)/);
  assert.match(script, /MIN_BUILD_AVAILABLE_KB=2097152/);
  assert.match(script, /source archive must not contain node_modules/);
  assert.match(script, /prepare_release_dependencies/);
  assert.match(script, /chown root:root "\$release"/);
});

test("TraceSheet uses the shared API and an immutable static application route", async () => {
  const config = await readFile(new URL("../deploy/nginx/idol-match-test.conf", import.meta.url), "utf8");

  assert.match(config, /location = \/tracesheet \{\s*return 301 \/tracesheet\/;/);
  assert.match(config, /location \^~ \/tracesheet\/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4195;/);
  assert.match(config, /location \^~ \/tracesheet\/_next\/static\/ \{[\s\S]*?max-age=31536000, immutable/);
  assert.match(config, /location \/tracesheet\/ \{[\s\S]*?try_files \$uri \$uri\/ \/tracesheet\/index\.html;/);
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
