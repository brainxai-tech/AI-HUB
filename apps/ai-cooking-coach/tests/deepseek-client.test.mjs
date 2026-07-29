import test from "node:test";
import assert from "node:assert/strict";

import {
  COOKING_SYSTEM_PROMPT,
  buildCookingSystemPrompt,
  buildDeepSeekPayload,
  generatePlanWithDeepSeek
} from "../src/server/deepseek-client.mjs";
import { COOKING_AGENT_SYSTEM_PROMPT } from "../src/domain/cooking-agent-prompt.mjs";

const profile = {
  days: 3,
  familySize: 2,
  targetCalories: 1500,
  heightCm: 170,
  weightKg: 70,
  goal: "减脂",
  cuisine: "中式",
  allergies: "",
  dislikes: "",
  budget: "每周 300 元",
  prepTime: "每天 30 分钟",
  equipment: "电饭煲",
  pantry: "鸡蛋"
};

test("buildDeepSeekPayload keeps the legacy helper contract for Hub JSON output", () => {
  const payload = buildDeepSeekPayload(profile, "gpt-5.4", "openai");

  assert.equal(payload.model, "gpt-5.4");
  assert.equal(payload.response_format.type, "json_object");
  assert.equal(payload.thinking, undefined);
  assert.equal(payload.messages[0].role, "system");
  assert.notEqual(payload.messages[0].content, COOKING_SYSTEM_PROMPT);
  assert.equal(payload.messages[0].content, buildCookingSystemPrompt(profile));
  assert.match(payload.messages[0].content, /# 中式家庭减脂备餐规划师/);
  assert.match(payload.messages[0].content, /个性化备餐计划生成/);
  assert.match(payload.messages[0].content, /精准采购与费用估算/);
  assert.match(payload.messages[0].content, /分场景备餐指南/);
  assert.match(payload.messages[0].content, /主用户身高：170 cm/);
  assert.match(payload.messages[0].content, /主用户体重：70 kg/);
  assert.match(payload.messages[0].content, /主用户BMI：24\.2（偏高）/);
  assert.match(payload.messages[0].content, /主用户每日蛋白目标：84-112 g/);
  assert.match(payload.messages[0].content, /steps 至少 5 步/);
  assert.match(payload.messages[0].content, /切配形态、调味比例、锅具或设备、火候、时长、熟成判断/);
  assert.match(payload.messages[0].content, /本地食材营养 RAG/);
  assert.match(payload.messages[0].content, /shoppingList\.name 或用户现有食材/);
  assert.match(payload.messages[0].content, /weeklyPlan/);
  assert.match(payload.messages[0].content, /mealPrepGuide/);
  assert.match(payload.messages[0].content, /每项食材的市场价格/);
  assert.match(payload.messages[0].content, /estimatedCost/);
  assert.ok(payload.messages[0].content.startsWith(COOKING_AGENT_SYSTEM_PROMPT));
  assert.match(payload.messages[1].content, /只输出 JSON/);
  assert.match(payload.messages[1].content, /主用户 BMI: 24\.2/);
  assert.match(payload.messages[1].content, /steps 至少 5 步/);
  assert.match(payload.messages[1].content, /看到什么状态算完成/);
  assert.equal(payload.max_tokens, 9000);
});

test("buildCookingSystemPrompt does not invent body metrics when omitted", () => {
  const prompt = buildCookingSystemPrompt({
    days: 7,
    familySize: 2,
    targetCalories: 1500,
    goal: "减脂",
    cuisine: "中式"
  });

  assert.doesNotMatch(prompt, /主用户身高/);
  assert.doesNotMatch(prompt, /主用户体重/);
  assert.doesNotMatch(prompt, /主用户BMI/);
  assert.doesNotMatch(prompt, /每日蛋白目标/);
  assert.match(prompt, /未提供身高体重/);
});

test("generatePlanWithDeepSeek uses scoped Hub access and normalizes model JSON", async () => {
  const calls = [];
  const plan = await generatePlanWithDeepSeek({
    profile,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: "{\"weeklyPlan\":{\"day1\":{\"breakfast\":{\"name\":\"鸡蛋豆腐燕麦\",\"calories\":430,\"protein\":28,\"ingredients\":[\"鸡蛋2个\",\"豆腐100g\"],\"steps\":[\"洗豆腐\",\"打鸡蛋\",\"煮燕麦\",\"蒸豆腐\",\"分装复热\"]}}},\"shoppingList\":[{\"name\":\"豆腐\",\"amount\":\"400g\",\"estimatedCost\":8}],\"mealPrepGuide\":{\"sundayPrep\":{\"duration\":\"2小时\",\"tasks\":[\"0-30分钟：清洗豆腐\"]},\"weekdayReheat\":{\"lunch\":\"微波炉加热2分钟\"}}}"
                }
              }
            ]
          };
        }
      };
    }
  });

  assert.equal(calls[0].url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(plan.title, "中式家庭减脂备餐计划");
  assert.equal(plan.days[0].totalProtein, 28);
  assert.equal(plan.shoppingList[0].items[0].display, "豆腐 400g 约 8 元");
  assert.equal(plan.shoppingList[0].items[0].rag.name, "豆腐");
  assert.equal(plan.shoppingList[0].items[0].nutritionStatus, "matched");
  assert.match(plan.guardrails.at(-1), /采购食材已匹配本地 RAG/);
  assert.equal(plan.batchPrep[0].task, "清洗豆腐");
});

test("generatePlanWithDeepSeek ignores legacy provider overrides and stays on Hub", async () => {
  const calls = [];
  await generatePlanWithDeepSeek({
    provider: "gemini",
    model: "gpt-4.1-mini",
    profile,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: "{\"title\":\"OpenAI 计划\",\"days\":[{\"day\":\"第 1 天\",\"meals\":[{\"name\":\"鸡蛋豆腐\",\"calories\":500,\"protein\":32,\"steps\":[\"蒸豆腐\"]}]}],\"shoppingList\":[],\"batchPrep\":[]}"
                }
              }
            ]
          };
        }
      };
    }
  });

  const payload = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(payload.model, undefined);
  assert.equal(payload.thinking, undefined);
});

test("generatePlanWithDeepSeek maps missing Hub access to a useful error", async () => {
  await assert.rejects(
    () => generatePlanWithDeepSeek({
      profile,
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async text() {
          return "Unauthorized";
        }
      })
    }),
    /AI Hub/
  );
});

test("generatePlanWithDeepSeek maps Hub network failures to a useful error", async () => {
  await assert.rejects(
    () => generatePlanWithDeepSeek({
      profile,
      fetchImpl: async () => {
        const error = new TypeError("fetch failed");
        error.cause = { code: "EACCES" };
        throw error;
      }
    }),
    /无法连接 AI Hub/
  );
});
