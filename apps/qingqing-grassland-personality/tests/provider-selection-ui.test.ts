import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const componentSource = readFileSync(
  new URL("../components/GrasslandTest.tsx", import.meta.url),
  "utf8"
);

describe("Hub-backed smart analysis UI", () => {
  it("starts without user provider or API key setup", () => {
    assert.match(componentSource, /const canStartTest = true;/);
    assert.match(componentSource, /fetch\(`\$\{basePath\}\/api\/deepseek-result`/);
    assert.doesNotMatch(componentSource, /deepSeekApiKey|aiProvider|activeAiProvider/);
  });

  it("does not render legacy provider, model, Base URL, or API key controls", () => {
    const legacyControlIds = [
      "model-api-key",
      "deepseek-api-key",
      "model-provider",
      "model-base-url",
      "model-name",
      "legacy-deepseek-panel"
    ];

    for (const id of legacyControlIds) {
      assert.doesNotMatch(componentSource, new RegExp(id), `${id} should not be rendered`);
    }
  });

  it("does not send user-managed provider credentials to the result endpoint", () => {
    const requestBodyStart = componentSource.indexOf("body: JSON.stringify({");
    const requestBodyEnd = componentSource.indexOf("})", requestBodyStart);
    const requestBodySource = componentSource.slice(requestBodyStart, requestBodyEnd);

    assert.ok(requestBodyStart > -1, "result request body should be present");
    assert.match(requestBodySource, /modeLabel/);
    assert.match(requestBodySource, /answeredCount/);
    assert.match(requestBodySource, /personalityId/);
    assert.match(requestBodySource, /scores/);
    assert.doesNotMatch(requestBodySource, /apiKey|provider|baseUrl|model/);
  });
});
