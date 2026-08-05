import test from "node:test";
import assert from "node:assert/strict";

import agentHandler from "../api/agent.js";
import healthHandler from "../api/health.js";
import { createMealAdjustmentHandler } from "../api/adjust-meal.js";
import { createPlanHandler } from "../api/plan.js";
import { createWeekReviewHandler } from "../api/review-week.js";

function createResponse() {
  return {
    headers: new Map(),
    statusCode: 0,
    payload: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

test("Vercel GET /api/health returns ok", () => {
  const response = createResponse();

  healthHandler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("Vercel GET /api/agent returns Hub-managed agent metadata", () => {
  const response = createResponse();

  agentHandler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.provider, "AI Project Hub");
  assert.deepEqual(response.payload.modelOptions, ["Hub default provider/model"]);
  assert.equal(response.payload.apiKeyPolicy, "hub_managed");
  assert.equal(response.payload.apiKeyRequired, false);
  assert.match(response.payload.systemPrompt, /# 中式家庭减脂备餐规划师/);
  assert.match(response.payload.systemPrompt, /暂未命中 RAG，也必须继续生成并保留该采购项/);
});

test("Vercel POST /api/plan falls back without a project-level API key", async () => {
  const response = createResponse();
  const handler = createPlanHandler({
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    }
  });

  await handler({
    method: "POST",
    headers: {},
    body: { profile: { days: 3, familySize: 2, targetCalories: 1500 } }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.mode, "fallback");
  assert.ok(response.payload.plan);
});

test("Vercel POST /api/plan proxies to DeepSeek when API key is supplied", async () => {
  const response = createResponse();
  const handler = createPlanHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Vercel plan",
                  weeklyPlan: {
                    day1: {
                      breakfast: {
                        name: "Serverless breakfast",
                        ingredients: [],
                        steps: ["Wash ingredients", "Cook gently", "Plate"],
                        calories: 320,
                        protein: 24
                      }
                    }
                  },
                  shoppingList: [],
                  mealPrepGuide: {
                    sundayPrep: { duration: "1 hour", tasks: [] },
                    weekdayReheat: {}
                  }
                })
              }
            }
          ]
        };
      }
    })
  });

  await handler({
    method: "POST",
    headers: {},
    body: {
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      profile: { days: 3, familySize: 2, targetCalories: 1500 }
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.mode, "live");
  assert.equal(response.payload.plan.title, "Vercel plan");
});

test("Vercel OPTIONS /api/plan supports local preflight", async () => {
  const response = createResponse();
  const handler = createPlanHandler();

  await handler({
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5500"
    }
  }, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5500");
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

test("Vercel POST /api/adjust-meal returns fallback without an API key", async () => {
  const response = createResponse();
  const handler = createMealAdjustmentHandler();

  await handler({
    method: "POST",
    headers: {},
    body: {
      plan: {
        title: "Vercel execution plan",
        days: [
          {
            day: "第 1 天",
            meals: [
              {
                slot: "午餐",
                name: "鸡胸肉糙米饭",
                ingredients: ["鸡胸肉150g", "糙米100g"],
                calories: 520,
                protein: 38
              }
            ]
          }
        ],
        shoppingList: [],
        batchPrep: []
      },
      mealKey: "day0-meal0",
      reason: "缺少鸡胸肉",
      constraints: "只有豆腐"
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.mode, "fallback");
  assert.equal(response.payload.adjustment.originalName, "鸡胸肉糙米饭");
  assert.match(response.payload.adjustment.replacement.name, /豆腐|应急/);
});

test("Vercel OPTIONS /api/adjust-meal supports local preflight", async () => {
  const response = createResponse();
  const handler = createMealAdjustmentHandler();

  await handler({
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5500"
    }
  }, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5500");
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

test("Vercel POST /api/review-week returns fallback without an API key", async () => {
  const response = createResponse();
  const handler = createWeekReviewHandler();

  await handler({
    method: "POST",
    headers: {},
    body: {
      plan: {
        title: "Vercel review plan",
        days: [{ day: "Day 1", meals: [{ name: "Chicken rice" }] }],
        shoppingList: [],
        batchPrep: []
      },
      executionState: {
        planId: "vercel-review",
        shopping: [[true]],
        prep: [false],
        meals: { "day0-meal0": "replaced" },
        replacements: [{ originalName: "Chicken rice", replacementName: "Tofu rice" }]
      },
      feedback: "Too much chicken."
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.mode, "fallback");
  assert.match(response.payload.review.summary, /Vercel review plan/);
  assert.ok(response.payload.review.nextWeekAdjustments.length >= 1);
});

test("Vercel OPTIONS /api/review-week supports local preflight", async () => {
  const response = createResponse();
  const handler = createWeekReviewHandler();

  await handler({
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5500"
    }
  }, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5500");
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});
