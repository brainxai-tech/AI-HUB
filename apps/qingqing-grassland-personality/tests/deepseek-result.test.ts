import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dimensions, personalityTypes } from "../data/personality-test.ts";
import {
  buildDeepSeekResultPrompt,
  generateDeepSeekResult,
  parseDeepSeekResultContent,
  type DeepSeekResultPayload
} from "../lib/deepseek-result.ts";

const sun = personalityTypes.find((type) => type.id === "grassland-sun")!;

const payload: DeepSeekResultPayload = {
  modeLabel: "专业版 · 完整 30 题",
  answeredCount: 30,
  personality: sun,
  scores: { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
  dimensions
};

const generatedJson = JSON.stringify({
  personalityName: sun.name,
  keywords: ["发光", "热情", "明亮"],
  summary: "模型生成的核心描述。",
  strength: "模型生成的优势。",
  blindSpot: "模型生成的盲点。",
  relationshipTip: "模型生成的相处建议。",
  dailyAdvice: "模型生成的今日提醒。"
});

describe("deepseek result helpers", () => {
  it("builds a prompt with the fixed local personality and normalized scores", () => {
    const prompt = buildDeepSeekResultPrompt(payload);

    assert.match(prompt, /grassland-sun/);
    assert.doesNotMatch(prompt, /moonlight-boundary/);
    assert.match(prompt, /SE: 80/);
    assert.match(prompt, /专业版/);
    assert.match(prompt, /不要重新判断人格类型/);
    assert.match(prompt, /JSON/);
  });

  it("parses strict JSON result content against the fixed local personality", () => {
    const result = parseDeepSeekResultContent(JSON.stringify({
      personalityName: sun.name,
      keywords: ["明亮", "热情", "带动"],
      summary: "你像一束草原日光。",
      strength: "能把现场气氛点亮。",
      blindSpot: "容易承担太多回应。",
      relationshipTip: "保留能量边界。",
      dailyAdvice: "今天先给自己留一点光。"
    }), sun);

    assert.equal(result.personalityId, sun.id);
    assert.equal(result.personalityName, sun.name);
    assert.deepEqual(result.keywords, ["明亮", "热情", "带动"]);
    assert.match(result.summary, /草原/);
  });

  it("keeps the fixed local personality when the model tries to rename it", () => {
    const result = parseDeepSeekResultContent(JSON.stringify({
      personalityName: "模型乱改型",
      keywords: ["明亮", "热情", "带动"],
      summary: "模型生成的核心描述。",
      strength: "模型生成的优势。",
      blindSpot: "模型生成的盲点。",
      relationshipTip: "模型生成的相处建议。",
      dailyAdvice: "模型生成的今日提醒。"
    }), sun);

    assert.equal(result.personalityId, sun.id);
    assert.equal(result.personalityName, sun.name);
  });

  it("rejects generated result content without analysis fields", () => {
    assert.throws(
      () => parseDeepSeekResultContent(JSON.stringify({
        personalityName: sun.name,
        keywords: ["明亮", "热情", "带动"],
        summary: "不完整。"
      }), sun),
      /格式不完整/
    );
  });

  it("calls AI Project Hub gateway and parses the result", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const result = await generateDeepSeekResult(payload, async (url, init) => {
      requests.push({ url: String(url), init });

      return Response.json({
        choices: [
          {
            message: {
              content: generatedJson
            }
          }
        ]
      });
    });

    const requestBody = JSON.parse(String(requests[0]!.init?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
      response_format?: { type?: string };
      stream?: boolean;
    };
    const headers = requests[0]!.init?.headers as Record<string, string>;

    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, "http://127.0.0.1:4194/api/v1/chat/completions");
    assert.equal(headers.Authorization, undefined);
    assert.equal(headers["x-api-key"], undefined);
    assert.equal(requestBody.response_format?.type, "json_object");
    assert.equal(requestBody.stream, false);
    assert.match(requestBody.messages?.[0]?.content ?? "", /严格 JSON/);
    assert.match(requestBody.messages?.[1]?.content ?? "", /grassland-sun/);
    assert.equal(result.personalityId, sun.id);
    assert.equal(result.summary, "模型生成的核心描述。");
  });

  it("reports Hub gateway errors with status context", async () => {
    await assert.rejects(
      () => generateDeepSeekResult(payload, async () => new Response(
        JSON.stringify({ error: { message: "quota exceeded" } }),
        { status: 402 }
      )),
      /AI Project Hub 402: quota exceeded/
    );
  });
});
