import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), "utf8");

test("Hub landmarks use ARIA labels only with compatible roles", async () => {
  const html = await read("public/index.html");

  assert.match(html, /class="status-strip" role="group" aria-label="项目统计"/);
  assert.match(html, /id="routingFlow" class="routing-callout__copy" role="region" aria-labelledby="routingHeroTitle"/);
});

test("Hub catalog count comes from the live project collection", async () => {
  const [html, app] = await Promise.all([
    read("public/index.html"),
    read("public/app.js"),
  ]);

  assert.match(html, /id="catalogCount">浏览全部项目</);
  assert.doesNotMatch(html, /浏览全部\s+\d+\s+个项目/);
  assert.match(app, /catalogCount\.textContent = `共 \$\{projects\.length\} 个项目`/);
});

test("muted text token remains dark enough for compact badges", async () => {
  const styles = await read("public/styles.css");

  assert.match(styles, /--muted:\s*#5f6b66/);
  assert.doesNotMatch(styles, /--muted:\s*#66726d/);
});
