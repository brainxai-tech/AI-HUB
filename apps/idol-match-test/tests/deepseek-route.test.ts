import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { POST as legacyResultPost } from "../app/api/deepseek-result/route.ts";
import { POST as resultPost } from "../app/api/compatible-result/route.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const makeCandidate = () => ({
  id: "idol-a",
  name: "测试爱豆 A",
  summary: "候选",
  score: 88,
  confidence: 80,
  tags: ["舞台型", "清冷", "实力派"],
  matchedTags: ["舞台型", "清冷", "实力派"],
  entryReasons: ["舞台直拍", "练习室视频", "采访切片"],
  dimensionScores: [
    { label: "舞台", score: 8, matchedTags: ["舞台型"] },
    { label: "审美", score: 7, matchedTags: ["清冷"] },
    { label: "作品", score: 5, matchedTags: ["实力派"] },
  ],
});

const makeRequestBody = () => ({
  modeName: "体验版",
  userTags: ["舞台型"],
  fixedIdolId: "idol-a",
  candidates: [makeCandidate()],
});

const richGeneratedContent = (idolId = "idol-a") =>
  JSON.stringify({
    idolId,
    idolName: "测试爱豆 A",
    score: 90,
    confidence: 84,
    summary:
      "Hub 模型网关生成结果会把舞台表现、清冷审美和实力稳定性串起来，说明用户为什么会先被现场吸引，再通过练习室和日常内容确认长期上头感。",
    matchedTags: ["舞台型", "清冷", "实力派"],
    reasons: [
      "用户高频偏好集中在舞台型，候选画像也把现场表现和直拍入口放在核心位置。",
      "清冷审美让结果不只依赖热闹氛围，也提供了更耐看的个人气质记忆点。",
      "实力派标签说明用户可能更在意稳定发挥，适合通过练习室和现场合集继续验证。",
      "这个结果的入坑路径清晰，从高光舞台到日常反差都有可以继续补档的内容。",
    ],
    entryPath: [
      "先看一条高完成度舞台直拍，判断镜头吸引力和节奏是否立刻命中。",
      "再补练习室或现场合集，确认实力稳定性不是单个片段带来的错觉。",
      "最后看采访和日常切片，验证清冷气质之外有没有长期陪伴感。",
    ],
    dimensionScores: [
      { label: "舞台", score: 8, matchedTags: ["舞台型"] },
      { label: "审美", score: 7, matchedTags: ["清冷"] },
      { label: "作品", score: 5, matchedTags: ["实力派"] },
    ],
    top3: [
      { idolId, idolName: "测试爱豆 A", score: 90, difference: "第一名更偏舞台冲击和清冷审美，适合从直拍快速入坑。" },
    ],
  });

describe("Hub-backed result routes", () => {
  it("rejects incomplete match context before calling the model gateway", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return Response.json({});
    }) as typeof fetch;

    const response = await resultPost(
      new Request("http://localhost/api/compatible-result", {
        method: "POST",
        body: JSON.stringify({ modeName: "体验版" }),
      }),
    );
    const payload = (await response.json()) as { error?: { code?: string } };

    assert.equal(response.status, 422);
    assert.equal(payload.error?.code, "INVALID_MATCH_CONTEXT");
    assert.equal(fetchCalled, false);
  });

  it("sends the fixed match context through AI Project Hub gateway", async () => {
    let requestUrl = "";
    let requestHeaders: Record<string, string> = {};
    let requestBody = "";

    globalThis.fetch = (async (url, init) => {
      requestUrl = String(url);
      requestHeaders = init?.headers as Record<string, string>;
      requestBody = String(init?.body ?? "");
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: richGeneratedContent() } }],
        usage: { total_tokens: 123 },
      });
    }) as typeof fetch;

    const response = await resultPost(
      new Request("http://localhost/api/compatible-result", {
        method: "POST",
        body: JSON.stringify(makeRequestBody()),
      }),
    );
    const payload = (await response.json()) as {
      result?: { idolId?: string; summary?: string; reasons?: string[] };
      repaired?: boolean;
    };
    const hubRequest = JSON.parse(requestBody) as {
      response_format?: { type?: string };
      messages?: Array<{ content: string }>;
      temperature?: number;
      max_tokens?: number;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.result?.idolId, "idol-a");
    assert.ok((payload.result?.summary ?? "").length >= 60);
    assert.equal(payload.result?.reasons?.length, 4);
    assert.equal(payload.repaired, false);
    assert.equal(requestUrl, "http://127.0.0.1:4194/api/v1/chat/completions");
    assert.equal(requestHeaders.Authorization, undefined);
    assert.equal(requestHeaders["x-api-key"], undefined);
    assert.equal(hubRequest.response_format?.type, "json_object");
    assert.equal(hubRequest.temperature, 0.55);
    assert.equal(hubRequest.max_tokens, 2200);
    assert.match(hubRequest.messages?.[0]?.content ?? "", /JSON/);
    assert.match(hubRequest.messages?.[0]?.content ?? "", /固定值：idol-a/);
  });

  it("retries once through Hub when the first result is too sparse", async () => {
    let calls = 0;
    let repairPrompt = "";

    globalThis.fetch = (async (_url, init) => {
      calls += 1;
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };

      if (calls === 2) {
        repairPrompt = requestBody.messages?.[0]?.content ?? "";
      }

      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: calls === 1 ? JSON.stringify({ idolId: "idol-a", summary: "太短" }) : richGeneratedContent(),
            },
          },
        ],
        usage: { total_tokens: calls === 1 ? 20 : 240 },
      });
    }) as typeof fetch;

    const response = await resultPost(
      new Request("http://localhost/api/compatible-result", {
        method: "POST",
        body: JSON.stringify(makeRequestBody()),
      }),
    );
    const payload = (await response.json()) as { repaired?: boolean; result?: { reasons?: string[] } };

    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal(payload.repaired, true);
    assert.equal(payload.result?.reasons?.length, 4);
    assert.match(repairPrompt, /重新生成严格 JSON/);
  });

  it("keeps legacy result route alias available on the Hub gateway", async () => {
    let requestUrl = "";
    globalThis.fetch = (async (url) => {
      requestUrl = String(url);
      return Response.json({ choices: [{ message: { content: richGeneratedContent() } }] });
    }) as typeof fetch;

    const response = await legacyResultPost(
      new Request("http://localhost/api/deepseek-result", {
        method: "POST",
        body: JSON.stringify(makeRequestBody()),
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(requestUrl, "http://127.0.0.1:4194/api/v1/chat/completions");
  });
});
