import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("dedicated key configuration page exposes the complete three-step flow", async () => {
  const [html, script, styles] = await Promise.all([
    readProjectFile("public/key-config/index.html"),
    readProjectFile("public/key-config/key-config.js"),
    readProjectFile("public/key-config/key-config.css"),
  ]);

  for (const id of [
    "adminTokenInput",
    "verifyAdminButton",
    "routingKeyInput",
    "fetchModelsButton",
    "modelCatalog",
    "saveConfigButton",
    "clearSessionButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /API Key 配置 · AI 项目汇集库/);
  assert.match(html, /\/hub\/styles\.css\?v=20260724-routing-promo1/);
  assert.match(html, /\/hub\/suite-theme\.css\?v=20260717-frontend5/);
  assert.match(html, /\/hub\/suite-shell\.js\?v=20260728-gpt-only1/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /key-config\.js\?v=20260728-gpt-only1/);
  assert.match(html, /key-config\.css\?v=20260727-key-config2/);
  assert.doesNotMatch(html, /id="adminTokenInput"[^>]+value=/);
  assert.doesNotMatch(html, /<script(?![^>]+src=)/);

  assert.match(script, /"\/api\/admin\/verify"/);
  assert.match(script, /"\/api\/provider-models"/);
  assert.match(script, /"\/api\/model-config"/);
  assert.match(script, /headers\["x-hub-admin-token"\]/);
  assert.match(script, /enabled:\s*true/);
  assert.match(script, /elements\.routingKey\.value = ""/);
  assert.match(script, /window\.addEventListener\("pagehide"/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);

  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /var\(--accent\)/);
  assert.match(styles, /var\(--surface\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test("public Hub links to the dedicated API Key page in the header and routing hero", async () => {
  const [hubHtml, hubStyles] = await Promise.all([
    readProjectFile("public/index.html"),
    readProjectFile("public/styles.css"),
  ]);

  assert.match(hubHtml, /class="hub-config-entry" href="\/hub\/key-config\/">配置 API Key<\/a>/);
  assert.match(hubHtml, /class="action-button" href="\/hub\/key-config\/">配置 API Key<\/a>/);
  assert.match(hubStyles, /\.status-strip \.hub-config-entry/);
});

test("nginx serves the key page with private administration headers", async () => {
  const nginx = await readProjectFile("deploy/nginx/idol-match-test.conf");

  assert.match(nginx, /location = \/hub\/key-config \{/);
  assert.match(nginx, /return 301 \/hub\/key-config\//);
  assert.match(nginx, /location \^~ \/hub\/key-config\//);
  assert.match(nginx, /alias \/opt\/ai-project-hub\/current\/public\/key-config\//);
  assert.match(nginx, /Cache-Control "no-cache, no-store, must-revalidate"/);
  assert.match(nginx, /Referrer-Policy "no-referrer"/);
  assert.match(nginx, /X-Robots-Tag "noindex, nofollow"/);
  assert.match(nginx, /frame-ancestors 'none'/);
});
