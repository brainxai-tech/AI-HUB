import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../server.mjs";

test("GET /api/providers returns supported providers", async () => {
  const previousUrl = process.env.HUB_MODEL_CONFIG_URL;
  delete process.env.HUB_MODEL_CONFIG_URL;
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.url}/api/providers`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      body.providers.map((provider) => provider.id),
      ["deepseek", "openai", "anthropic", "gemini"],
    );
  } finally {
    restoreEnv("HUB_MODEL_CONFIG_URL", previousUrl);
    await app.close();
  }
});

test("POST /api/analyze rejects empty reading input without asking for API key", async () => {
  const app = await startTestServer();
  try {
    const response = await fetch(`${app.url}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-5.5",
        inputMode: "excerpt",
        title: "",
        content: "",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.doesNotMatch(body.error.message, /API Key/i);
  } finally {
    await app.close();
  }
});

test("POST /api/analyze returns normalized Hub output and markdown", async () => {
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "测试书",
                sourceBoundary: "基于用户提供的摘录原文",
                confidence: "HIGH",
                chapterMap: [{ chapter: "第一章", role: "提出问题" }],
                coreIdeas: [{ title: "核心观点", detail: "说明" }],
                actionList: [{ action: "明天实践", priority: "HIGH" }],
                counterArguments: [{ argument: "可能过度简化", rationale: "样本不足" }],
                questions: ["下一步读什么"],
                warnings: ["不要替代原书阅读"],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const app = await startTestServer({ fetchImpl: fakeFetch });
  try {
    const response = await fetch(`${app.url}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-5.5",
        inputMode: "excerpt",
        title: "测试书",
        content: "用户提供的摘录",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.analysis.title, "测试书");
    assert.equal(body.analysis.chapterMap.length, 1);
    assert.match(body.markdown, /## 行动清单/);
    assert.equal(body.source.kind, "excerpt");
  } finally {
    await app.close();
  }
});

function startTestServer(options = {}) {
  const server = createServer(options);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
