import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, inferDecisionAnchor } from "../server/prompt";
import type { GenerateRequest } from "../src/shared/contracts";

const request: GenerateRequest = {
  provider: "openai",
  model: "gpt-5.4",
  input: {
    repoName: "life/main",
    currentState: "最近有点乱，想换方向又怕不稳定。",
    decision: "到底要不要转向做 AI 产品？",
    values: "成长、自由、稳定现金流",
    constraints: "时间少，不能影响健康。",
    resources: "会写前端，也能做 demo。",
    timeHorizon: "90 天"
  }
};

describe("prompt builders", () => {
  it("extracts a concrete decision anchor from product decisions", () => {
    expect(inferDecisionAnchor("我要不要把 AI 人生版本控制器继续做成一个可发布的小产品？")).toBe(
      "AI 人生版本控制器"
    );
  });

  it("adds an input-refinement protocol to the system prompt", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("【输入增强协议】");
    expect(prompt).toContain("用户输入可能很随意、情绪化、碎片化或缺少背景");
    expect(prompt).toContain("最小可验证问题");
    expect(prompt).toContain("nextCommit 去补证据");
    expect(prompt).toContain("必须保留用户输入里的具体对象");
    expect(prompt).toContain("不能把“AI 人生版本控制器”改写成“AI 写作助手”");
    expect(prompt).toContain("最高优先级决策对象");
    expect(prompt).toContain("禁止把明确项目降级成泛泛的“AI 产品点子”");
  });

  it("asks the model to refine user input before producing JSON", () => {
    const prompt = buildUserPrompt(request);

    expect(prompt).toContain("请先在内部把上面的原始输入整理成");
    expect(prompt).toContain("证据缺口");
    expect(prompt).toContain("命名实体");
    expect(prompt).toContain("禁止替换成另一个无关产品");
    expect(prompt).toContain("最高优先级决策锚点");
    expect(prompt).toContain("程序提取的决策对象锚点");
    expect(prompt).toContain("禁止说“具体产品未定”");
    expect(prompt).toContain("decision 原文必须被视为真实任务边界");
    expect(prompt).toContain("不要输出“内部整理”字段");
    expect(prompt).toContain(request.input.decision);
  });
});
