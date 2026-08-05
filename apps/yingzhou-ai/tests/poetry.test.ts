import { describe, expect, it } from "vitest";
import { analyzePoem, countHanCharacters } from "../src/shared/analyzer";
import { buildDemoDrafts } from "../src/shared/demoGenerator";
import type { CreationInput } from "../src/shared/contracts";

const baseInput: CreationInput = {
  theme: "春日江南，雨后独行",
  genre: "five-quatrain",
  mode: "regulated",
  rhymeBook: "new-rhyme",
  mood: "quiet",
  acrostic: ""
};

describe("demo poetry generator", () => {
  it("generates three distinct five-character quatrains", () => {
    const drafts = buildDemoDrafts(baseInput);
    expect(drafts).toHaveLength(3);
    expect(new Set(drafts.map((draft) => draft.style)).size).toBe(3);
    for (const draft of drafts) {
      expect(draft.lines).toHaveLength(4);
      expect(draft.lines.every((line) => countHanCharacters(line) === 5)).toBe(true);
    }
  });

  it("generates seven-character acrostics with the requested leading characters", () => {
    const drafts = buildDemoDrafts({ ...baseInput, genre: "acrostic", acrostic: "吟舟春江" });
    for (const draft of drafts) {
      expect(draft.lines).toHaveLength(4);
      expect(draft.lines.map((line) => Array.from(line)[0]).join("")).toBe("吟舟春江");
      expect(draft.lines.every((line) => countHanCharacters(line) === 7)).toBe(true);
    }
  });
});

describe("poetry analyzer", () => {
  it("reports valid structure for a five-character quatrain", () => {
    const report = analyzePoem(["疏雨入空庭", "微灯照晚晴", "一舟随月远", "心与暮云平"], baseInput);
    expect(report.structure.status).toBe("pass");
    expect(report.score).toBeGreaterThanOrEqual(70);
  });

  it("reports invalid line length and incomplete acrostic", () => {
    const report = analyzePoem(
      ["吟清溪柳色新", "错随远水到芳津", "春邀明月同相照", "江伴长风不染尘"],
      { ...baseInput, genre: "acrostic", acrostic: "吟舟春江" }
    );
    expect(report.structure.status).toBe("warn");
    expect(report.acrostic?.status).toBe("warn");
  });

  it("ignores punctuation when counting Chinese characters", () => {
    expect(countHanCharacters("一川烟雨，入江南。 ")).toBe(7);
  });
});
