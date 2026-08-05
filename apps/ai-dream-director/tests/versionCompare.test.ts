import { describe, expect, it } from "vitest";
import { defaultModels, type GenerateDreamRequest } from "../src/shared/contracts.js";
import { createVersionComparison } from "../src/shared/versionCompare.js";
import { demoDirectorOutput } from "../server/dreamDirector.js";

const request: GenerateDreamRequest = {
  provider: "demo",
  model: defaultModels.demo,
  dreamText: "我梦见废弃电影院里有生日录像和发光的钥匙。",
  style: "surreal",
  tone: "迷离、克制、带一点希望",
  durationMinutes: 3,
  intensity: 3,
  language: "zh-CN"
};

describe("version comparison", () => {
  it("summarizes fidelity, element, shot, and poster differences", () => {
    const base = demoDirectorOutput(request);
    const candidate = {
      ...base,
      title: `${base.title} 重剪版`,
      fidelity: {
        ...base.fidelity,
        score: base.fidelity.score + 2,
        preserved: [...base.fidelity.preserved, "自动售票机"]
      },
      dreamElements: [
        ...base.dreamElements,
        {
          label: "自动售票机",
          type: "object" as const,
          source: "走廊尽头有一台自动售票机",
          status: "used" as const,
          usage: "作为第二幕的转场装置"
        }
      ],
      shots: base.shots.map((shot, index) => (index === 0 ? { ...shot, videoPrompt: `${shot.videoPrompt}, stronger dolly push` } : shot)),
      poster: {
        ...base.poster,
        prompt: `${base.poster.prompt}, bold festival typography`
      }
    };

    const comparison = createVersionComparison(base, candidate);

    expect(comparison.fidelityDelta).toBe(2);
    expect(comparison.addedElements).toContain("自动售票机");
    expect(comparison.changedShots).toBe(1);
    expect(comparison.posterChanged).toBe(true);
    expect(comparison.summary).toContain("保真度 +2");
  });
});
