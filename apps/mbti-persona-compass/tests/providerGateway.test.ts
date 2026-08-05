import { describe, expect, it } from "vitest";
import { questions } from "../src/data/questions";
import { personalityProfiles } from "../src/data/results";
import { scoreAnswers } from "../src/lib/scoring";
import type { AnswerMap, AnswerValue } from "../src/types";
import { resolveHubRuntime, writeHubModelSelection, type HubRuntime } from "../server/hubRuntime.js";
import { generateAiInterpretation, parseAiInterpretation } from "../server/providerGateway.js";

const validInterpretation = {
  headline: "你在独处中整理可能性",
  reasoningSummary: "四个维度共同显示 INFP 偏好，其中情感决策最清晰，行动节奏更具弹性。",
  dimensionInsights: [
    { dimension: "EI", conclusion: "偏向内在充电", reason: "多个独处场景回答一致。", evidenceQuestionIds: [5, 13], nuance: "必要社交并不与内向偏好冲突。" },
    { dimension: "SN", conclusion: "偏向整体可能", reason: "更常关注主题与模式。", evidenceQuestionIds: [10, 26], nuance: "仍会用事实校验重要信息。" },
    { dimension: "TF", conclusion: "价值感受优先", reason: "决策时持续考虑相关人的体验。", evidenceQuestionIds: [3, 27], nuance: "重视感受不代表缺少逻辑。" },
    { dimension: "JP", conclusion: "保留探索空间", reason: "对临时变化的接受度较高。", evidenceQuestionIds: [8, 32], nuance: "关键节点仍可能主动规划。" },
  ],
  crossSignals: ["既需要独处，也愿意为重视的人主动连接。"],
  growthExperiments: [
    { title: "十五分钟开工", action: "选一件想做的事先投入十五分钟。", rationale: "用小行动保护理想。" },
    { title: "边界句", action: "本周清楚拒绝一件非必要请求。", rationale: "减少价值消耗。" },
    { title: "事实核对", action: "重要决定前写下三个可核对事实。", rationale: "平衡直觉与证据。" },
  ],
  closingNote: "把结果当作当前偏好地图，而不是终身标签。",
};

function answersFor(type: string): AnswerMap {
  return Object.fromEntries(questions.map((question) => {
    const value: AnswerValue = type.includes(question.pole) ? 2 : -2;
    return [question.id, value];
  })) as AnswerMap;
}

describe("AI provider gateway", () => {
  it("loads the GPT model and project identity from AI Hub", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const runtime = await resolveHubRuntime({
      env: {
        HUB_MODEL_CONFIG_URL: "https://hub.example.test/hub/api/model-config",
        HUB_CHAT_COMPLETIONS_URL: "https://hub.example.test/hub/api/v1/chat/completions",
        HUB_PROJECT_TOKEN: "test-project-token",
      },
      fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify({
          providers: [{
            id: "openai",
            model: "gpt-5.5",
            enabledModels: ["gpt-5.5"],
            models: ["gpt-5.5", "non-gpt-model"],
            enabled: true,
            configured: true,
          }],
        }), { status: 200 });
      }) as typeof fetch,
    });

    expect(capturedUrl).toBe("https://hub.example.test/hub/api/model-config");
    expect((capturedInit?.headers as Record<string, string>)["X-Hub-Project-Id"]).toBe("mbti-persona-compass");
    expect((capturedInit?.headers as Record<string, string>)["X-Hub-Project-Path"]).toBe("/mbti");
    expect((capturedInit?.headers as Record<string, string>)["X-Hub-Project-Token"]).toBe("test-project-token");
    expect(runtime.model).toBe("gpt-5.5");
    expect(runtime.models).toEqual(["gpt-5.5"]);
  });

  it("rejects non-GPT project model selections before contacting Hub", async () => {
    await expect(writeHubModelSelection("deep-model")).rejects.toMatchObject({
      code: "PROJECT_MODEL_INVALID",
      status: 400,
    });
  });

  it("parses strict JSON and fenced JSON", () => {
    expect(parseAiInterpretation(JSON.stringify(validInterpretation)).headline).toBe(validInterpretation.headline);
    expect(parseAiInterpretation(`\`\`\`json\n${JSON.stringify(validInterpretation)}\n\`\`\``).dimensionInsights).toHaveLength(4);
  });

  it("rejects evidence question ids from the wrong dimension", () => {
    const invalid = structuredClone(validInterpretation);
    invalid.dimensionInsights[0].evidenceQuestionIds = [2];
    expect(() => parseAiInterpretation(JSON.stringify(invalid))).toThrow("题目与解释维度不一致");
  });

  it("calls the Hub project proxy without leaking the project token into the payload", async () => {
    const answers = answersFor("INFP");
    const score = scoreAnswers(answers);
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validInterpretation) } }] }), { status: 200 });
    };

    const runtime: HubRuntime = {
      provider: "openai",
      model: "gpt-5.5",
      models: ["gpt-5.5"],
      chatUrl: "https://hub.example.test/hub/api/v1/chat/completions",
      projectId: "mbti-persona-compass",
      projectPath: "/mbti",
      projectToken: "test-project-token",
    };

    const result = await generateAiInterpretation({
      answers,
      score,
      profile: personalityProfiles.INFP,
    }, runtime, { fetcher: fetcher as typeof fetch });

    expect(capturedUrl).toBe(runtime.chatUrl);
    expect((capturedInit?.headers as Record<string, string>)["X-Hub-Project-Id"]).toBe("mbti-persona-compass");
    expect((capturedInit?.headers as Record<string, string>)["X-Hub-Project-Path"]).toBe("/mbti");
    expect((capturedInit?.headers as Record<string, string>)["X-Hub-Project-Token"]).toBe("test-project-token");
    expect(String(capturedInit?.body)).not.toContain("test-project-token");
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({ provider: "openai", model: "gpt-5.5" });
    expect(result.growthExperiments).toHaveLength(3);
  });
});
