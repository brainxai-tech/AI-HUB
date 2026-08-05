import assert from "node:assert/strict";
import test from "node:test";

import { POST as hubPost } from "../app/api/compatible-reading/route.ts";
import { POST as legacyPost } from "../app/api/deepseek-reading/route.ts";
import { tarotDeck } from "../data/tarot-deck.ts";
import type { GeneratedReading } from "../lib/types.ts";

function makeReading(): GeneratedReading {
  return {
    id: "route-test",
    createdAt: "2026-06-15T00:00:00.000Z",
    theme: "relationship",
    question: "我们还能不能复合？",
    cards: ["the-lovers", "two-of-cups", "the-moon"].map((id, index) => {
      const card = tarotDeck.find((item) => item.id === id)!;

      return {
        ...card,
        card,
        orientation: index === 2 ? "reversed" : "upright",
        position: ["root", "present", "trend"][index] as GeneratedReading["cards"][number]["position"],
      };
    }),
  };
}

function richGeneratedContent() {
  return JSON.stringify({
    intent: {
      id: "general-judgment",
      label: "复合 / 重新靠近",
      judgmentPath: "判断是否具备重新靠近的现实条件。",
      matchedKeywords: ["复合"],
    },
    verdict: {
      answer: "blocked",
      confidence: "medium",
      why: "因为月亮逆位让趋势不稳定。",
      whatToDo: ["先观察现实反馈", "不要强推", "七天后复盘"],
      resistanceSignals: [
        {
          cardName: "月亮",
          position: "trend",
          orientation: "reversed",
          contribution: -1,
          text: "趋势位的月亮逆位形成阻力。",
        },
      ],
      changeCondition: "改判条件：现实沟通变清晰后重新判断。",
    },
    summary: "Hub 模型网关生成的摘要。",
    cardSections: [],
    combination: "Hub 模型网关生成的组合解读。",
    riskNotes: ["不要用情绪替代事实。"],
    actions: {
      nextAction: "先观察。",
      avoid: "避免强推。",
      sevenDayObservation: "记录对方行为。",
    },
  });
}

test("Hub-backed route rejects invalid assessment payload", async () => {
  const response = await hubPost(
    new Request("http://localhost/api/compatible-reading", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.match(payload.error ?? "", /测评数据无效/);
});

test("Hub-backed route sends reading prompt through AI Project Hub gateway", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedHeaders: Record<string, string> = {};
  let requestedBody: Record<string, unknown> = {};

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers as Record<string, string>;
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return Response.json({
      choices: [{ message: { content: richGeneratedContent() } }],
    });
  };

  try {
    const response = await hubPost(
      new Request("http://localhost/api/compatible-reading", {
        method: "POST",
        body: JSON.stringify({
          reading: makeReading(),
        }),
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(requestedUrl, "http://127.0.0.1:4194/api/v1/chat/completions");
    assert.equal(requestedHeaders.Authorization, undefined);
    assert.equal(requestedHeaders["x-api-key"], undefined);
    assert.deepEqual(requestedBody.response_format, { type: "json_object" });
    assert.equal(requestedBody.stream, false);
    assert.equal(requestedBody.max_tokens, 2400);
    assert.ok(Array.isArray(requestedBody.messages));
    assert.equal(payload.verdict.answer, "blocked");
    assert.equal(payload.verdict.resistanceSignals[0].cardName, "月亮");
    assert.equal(payload.summary, "Hub 模型网关生成的摘要。");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy DeepSeek route alias remains available", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({
      choices: [{ message: { content: richGeneratedContent() } }],
    });
  };

  try {
    const response = await legacyPost(
      new Request("http://localhost/api/deepseek-reading", {
        method: "POST",
        body: JSON.stringify({
          reading: makeReading(),
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(requestedUrl, "http://127.0.0.1:4194/api/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
