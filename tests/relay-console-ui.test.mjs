import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const read = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), "utf8");

test("relay console stays a compact secondary surface", async () => {
  const [html, script, styles] = await Promise.all([
    read("public/relay-console/index.html"),
    read("public/relay-console/app.js"),
    read("public/relay-console/styles.css"),
  ]);
  assert.match(html, /id="authForm"/);
  assert.match(html, /id="dashboard" hidden/);
  assert.match(html, /id="createKeyButton"/);
  assert.match(html, /id="pricingBody"/);
  assert.match(html, /id="usageList"/);
  assert.match(script, /api\/relay-auth\/register/);
  assert.match(script, /api\/relay-keys/);
  assert.match(script, /api\/relay-wallet/);
  assert.match(script, /api\/relay-pricing/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
  assert.match(styles, /\.relay-console-grid/);
  assert.ok((await stat(new URL("../public/relay-console/index.html", import.meta.url))).size > 0);
});
