import test from "node:test";
import assert from "node:assert/strict";

import { createCookingCoachServer } from "../server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("GET /api/health returns ok", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  } finally {
    server.close();
  }
});

test("GET /api/agent returns the Hub-managed cooking agent prompt", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/agent`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.provider, "AI Project Hub");
    assert.deepEqual(body.modelOptions, ["Hub default provider/model"]);
    assert.equal(body.apiKeyPolicy, "hub_managed");
    assert.equal(body.apiKeyRequired, false);
    assert.match(body.systemPrompt, /# 中式家庭减脂备餐规划师/);
    assert.match(body.systemPrompt, /暂未命中 RAG，也必须继续生成并保留该采购项/);
  } finally {
    server.close();
  }
});

test("local server allows file-opened frontend requests", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "OPTIONS",
      headers: {
        Origin: "null",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "null");
    assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
    assert.match(response.headers.get("access-control-allow-headers") || "", /Content-Type/);
  } finally {
    server.close();
  }
});

test("local server allows frontend requests from other localhost ports", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5500",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5500");
    assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  } finally {
    server.close();
  }
});

test("POST /api/plan does not require a project-level API key", async () => {
  const server = createCookingCoachServer({
    fetchImpl: async () => { throw new Error("Hub unavailable in fallback test"); }
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: { days: 3, familySize: 2, targetCalories: 1500 }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "fallback");
    assert.ok(body.plan);
  } finally {
    server.close();
  }
});

test("POST /api/plan rejects malformed JSON without stopping the local server", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json"
    });
    const body = await response.json();
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /JSON/);
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ok, true);
  } finally {
    server.close();
  }
});

test("POST /api/plan falls back when Hub is unavailable without stopping the local server", async () => {
  const server = createCookingCoachServer({
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: { days: 3, familySize: 2, targetCalories: 1500 }
      })
    });
    const body = await response.json();
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "fallback");
    assert.ok(body.plan);
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ok, true);
  } finally {
    server.close();
  }
});

test("fallback plan preserves menu-library RAG provenance and allergy filtering", async () => {
  const server = createCookingCoachServer({
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          days: 1,
          familySize: 2,
          targetCalories: 1600,
          allergies: "花生",
          cuisine: "中式家常",
          goal: "健康备餐"
        }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "fallback");
    assert.equal(body.plan.recipeRag.source, "menu-library-rag");
    assert.ok(body.plan.recipeRag.retrieved.length > 0);
    assert.ok(body.plan.recipeRag.retrieved.every(({ sourceId }) => sourceId.startsWith("menu:")));
    assert.ok(body.plan.recipeRag.retrieved.every((recipe) => !/花生/.test(`${recipe.name} ${recipe.ingredientsText}`)));
  } finally {
    server.close();
  }
});

test("GET /data/ingredient-nutrition-rag.json serves the nutrition RAG index", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/data/ingredient-nutrition-rag.json`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.itemCount, 13693);
    assert.equal(body.servingBasis, "每 1g 食材约含量");
  } finally {
    server.close();
  }
});

test("GET /execution-state.mjs serves browser module JavaScript", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/execution-state.mjs`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /application\/javascript/);
    assert.match(body, /export function buildExecutionState/);
  } finally {
    server.close();
  }
});

test("POST /api/plan proxies to DeepSeek when API key is supplied", async () => {
  const server = createCookingCoachServer({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: "{\"title\":\"接口计划\",\"days\":[{\"day\":\"第 1 天\",\"meals\":[{\"name\":\"鸡蛋豆腐饭\",\"calories\":500,\"protein\":32,\"steps\":[\"蒸豆腐\"]}]}],\"shoppingList\":[],\"batchPrep\":[]}"
              }
            }
          ]
        };
      }
    })
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        model: "deepseek-v4-flash",
        profile: { days: 3, familySize: 2, targetCalories: 1500 }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "live");
    assert.equal(body.plan.title, "接口计划");
  } finally {
    server.close();
  }
});

test("POST /api/plan keeps shopping ingredients that do not match RAG", async () => {
  const server = createCookingCoachServer({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  weeklyPlan: {
                    day1: {
                      breakfast: {
                        name: "生抽鸡蛋",
                        ingredients: ["鸡蛋2个", "生抽5ml"],
                        steps: ["打散鸡蛋", "加入生抽", "搅拌均匀", "小火加热", "凝固后出锅"],
                        calories: 220,
                        protein: 14
                      }
                    }
                  },
                  shoppingList: [{ name: "生抽", amount: "250ml", estimatedCost: 8 }],
                  mealPrepGuide: {
                    sundayPrep: { duration: "10分钟", tasks: ["0-10分钟：检查调味料"] },
                    weekdayReheat: { breakfast: "现做即可" }
                  }
                })
              }
            }
          ]
        };
      }
    })
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        model: "deepseek-v4-flash",
        profile: { days: 1, familySize: 1, targetCalories: 1500, pantry: "鸡蛋2个" }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.plan.shoppingList[0].items[0].name, "生抽");
    assert.equal(body.plan.shoppingList[0].items[0].nutritionStatus, "unmatched");
    assert.equal(body.plan.shoppingList[0].items[0].rag, null);
    assert.match(body.plan.guardrails.at(-1), /未命中项已保留：生抽/);
  } finally {
    server.close();
  }
});

test("POST /api/plan auto-adds weekly ingredients missing from shopping list", async () => {
  const server = createCookingCoachServer({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  weeklyPlan: {
                    day1: {
                      breakfast: {
                        name: "葱花鸡蛋",
                        ingredients: ["鸡蛋2个", "盐1g", "葱5g"],
                        steps: ["打散鸡蛋", "切葱花", "加盐调味", "小火煎至定型", "出锅分装"],
                        calories: 220,
                        protein: 14
                      }
                    }
                  },
                  shoppingList: [],
                  mealPrepGuide: {
                    sundayPrep: { duration: "10分钟", tasks: ["0-10分钟：检查调味料"] },
                    weekdayReheat: { breakfast: "现做即可" }
                  }
                })
              }
            }
          ]
        };
      }
    })
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-test",
        model: "deepseek-v4-flash",
        profile: { days: 1, familySize: 1, targetCalories: 1500, pantry: "鸡蛋2个" }
      })
    });
    const body = await response.json();
    const autoGroup = body.plan.shoppingList.find((group) => group.category === "自动补充采购");

    assert.equal(response.status, 200);
    assert.ok(autoGroup);
    assert.deepEqual(autoGroup.items.map((item) => item.name), ["盐", "葱"]);
    assert.equal(autoGroup.items[0].nutritionStatus, "unmatched");
    assert.equal(autoGroup.items[1].nutritionStatus, "matched");
    assert.match(body.plan.guardrails.at(-1), /周计划缺失食材已自动补入采购清单：盐、葱/);
  } finally {
    server.close();
  }
});

const adjustmentPlan = {
  title: "接口执行计划",
  days: [
    {
      day: "第 1 天",
      meals: [
        {
          slot: "午餐",
          name: "鸡胸肉糙米饭",
          ingredients: ["鸡胸肉150g", "糙米100g"],
          steps: ["煮糙米", "煎鸡胸肉"],
          calories: 520,
          protein: 38,
          leftovers: "冷藏，午餐复热"
        }
      ]
    }
  ],
  shoppingList: [],
  batchPrep: []
};

test("POST /api/adjust-meal returns a local fallback when no API key is supplied", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/adjust-meal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: adjustmentPlan,
        mealKey: "day0-meal0",
        reason: "缺少鸡胸肉",
        constraints: "家里只有豆腐和鸡蛋"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "fallback");
    assert.equal(body.adjustment.mealKey, "day0-meal0");
    assert.equal(body.adjustment.originalName, "鸡胸肉糙米饭");
    assert.match(body.adjustment.replacement.name, /应急|替代|豆腐|鸡蛋/);
    assert.match(body.adjustment.nutritionDelta, /估算/);
  } finally {
    server.close();
  }
});

test("POST /api/adjust-meal proxies a structured replacement through Hub", async () => {
  let capturedRequest;
  const server = createCookingCoachServer({
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    replacement: {
                      name: "番茄豆腐糙米饭",
                      ingredients: ["豆腐200g", "番茄150g", "糙米100g"],
                      steps: ["切豆腐", "炒番茄", "加入豆腐", "调味收汁", "和糙米饭分装"],
                      calories: 480,
                      protein: 30,
                      leftovers: "冷藏 24 小时内复热",
                      nutritionDelta: "热量 -40 kcal，蛋白 -8g",
                      shoppingListDiff: ["补番茄150g"],
                      reasonSummary: "用豆腐替换鸡胸肉，保留糙米主食"
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/adjust-meal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: adjustmentPlan,
        mealKey: "day0-meal0",
        reason: "缺少鸡胸肉",
        constraints: "家里只有豆腐和番茄"
      })
    });
    const body = await response.json();
    const payload = JSON.parse(capturedRequest.options.body);

    assert.equal(response.status, 200);
    assert.equal(body.mode, "live");
    assert.equal(body.adjustment.replacement.name, "番茄豆腐糙米饭");
    assert.equal(body.adjustment.replacementName, "番茄豆腐糙米饭");
    assert.equal(capturedRequest.url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
    assert.equal(capturedRequest.options.headers.Authorization, undefined);
    assert.equal(payload.response_format.type, "json_object");
    assert.match(JSON.stringify(payload.messages), /缺少鸡胸肉/);
    assert.match(JSON.stringify(payload.messages), /鸡胸肉糙米饭/);
  } finally {
    server.close();
  }
});

test("POST /api/review-week returns local fallback without an API key", async () => {
  const server = createCookingCoachServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/review-week`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: {
          title: "Weekly review plan",
          days: [{ day: "Day 1", meals: [{ name: "Chicken rice" }] }],
          shoppingList: [],
          batchPrep: []
        },
        executionState: {
          planId: "review-plan",
          shopping: [[true, false]],
          prep: [true],
          meals: { "day0-meal0": "skipped" },
          replacements: []
        },
        feedback: "Lunch was repetitive."
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "fallback");
    assert.match(body.review.summary, /Weekly review plan/);
    assert.ok(body.review.frictions.some((item) => /跳过|skipped|完成率/.test(item)));
    assert.ok(body.review.nextWeekAdjustments.length >= 1);
    assert.ok(body.review.promptHints.some((item) => /Lunch was repetitive|用户反馈/.test(item)));
  } finally {
    server.close();
  }
});

test("POST /api/review-week proxies structured review through Hub", async () => {
  let capturedPayload;
  const server = createCookingCoachServer({
    fetchImpl: async (_url, options) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    review: {
                      summary: "本周完成稳定。",
                      wins: ["采购执行不错"],
                      frictions: ["午餐重复"],
                      nextWeekAdjustments: ["增加鱼虾和豆腐"],
                      promptHints: ["下周减少鸡胸肉饭"]
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/api/review-week`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: {
          title: "Live review plan",
          days: [{ day: "Day 1", meals: [{ name: "Chicken rice" }] }],
          shoppingList: [],
          batchPrep: []
        },
        executionState: {
          planId: "live-review",
          shopping: [[true]],
          prep: [true],
          meals: { "day0-meal0": "cooked" },
          replacements: []
        },
        feedback: "Want more variety."
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.mode, "live");
    assert.equal(body.review.summary, "本周完成稳定。");
    assert.equal(body.review.nextWeekAdjustments[0], "增加鱼虾和豆腐");
    assert.equal(capturedPayload.model, undefined);
    assert.equal(capturedPayload.response_format.type, "json_object");
    assert.match(capturedPayload.messages[1].content, /Want more variety/);
  } finally {
    server.close();
  }
});
