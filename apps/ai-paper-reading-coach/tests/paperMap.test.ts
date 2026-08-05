import { describe, expect, it } from "vitest";
import { parsePaperText } from "../server/paperParser.js";
import { buildPaperMapOutput } from "../src/shared/paperMap.js";

const completePaper = `
Evidence Grounded Paper Coaching
Jane Doe, Max Researcher

Abstract
This paper studies how novice readers understand dense research articles. It proposes a guided workflow that connects claims, evidence, review prompts, and uncertainty labels.

1 Introduction
Reading papers is difficult because papers assume background knowledge and hide the role of each section. The research question is whether a guided reading workflow can improve comprehension.

2 Methods
We collected annotations from graduate students and compared guided reading against unguided reading across two reading sessions.

3 Experiments
The experiment used three research papers, comprehension questions, and follow-up interviews to compare accuracy and confidence.

4 Results
Participants using the coach produced more accurate summaries and asked more targeted follow-up questions.

5 Discussion
The workflow is less useful when a paper is a scanned PDF without a reliable text layer, and the study uses a small participant group.
`;

describe("paper map output", () => {
  it("builds a cited paper map with research question, method, experiment, conclusion, and limitations", () => {
    const paper = parsePaperText(completePaper, { sourceName: "complete.txt" });
    const output = buildPaperMapOutput(paper);
    const block = (heading: string) => output.blocks.find((item) => item.heading === heading);

    expect(output.title).toBe("论文地图");
    expect(output.blocks.map((item) => item.heading)).toEqual(
      expect.arrayContaining(["研究问题", "方法路线", "数据/实验", "主要结论", "局限性"])
    );
    expect(block("研究问题")?.evidence).toBe("based_on_text");
    expect(block("研究问题")?.refs[0]).toMatch(/^S\d+-P\d+$/);
    expect(block("方法路线")?.refs.length).toBeGreaterThan(0);
    expect(block("数据/实验")?.refs.length).toBeGreaterThan(0);
    expect(block("主要结论")?.refs.length).toBeGreaterThan(0);
    expect(block("局限性")?.evidence).toMatch(/based_on_text|inferred/);
    expect(output.notesMarkdown).toContain("## 论文地图");
    expect(output.notesMarkdown).toContain("S");
  });

  it("marks missing evidence as uncertain instead of inventing missing sections", () => {
    const paper = parsePaperText(`
Minimal Paper

Abstract
This short note only states that a coaching tool may help readers notice uncertainty.
`, { sourceName: "minimal.txt" });
    const output = buildPaperMapOutput(paper);
    const method = output.blocks.find((item) => item.heading === "方法路线");
    const conclusion = output.blocks.find((item) => item.heading === "主要结论");

    expect(method?.evidence).toBe("uncertain");
    expect(method?.refs).toEqual([]);
    expect(conclusion?.evidence).toBe("uncertain");
    expect(output.uncertainty.join(" ")).toContain("Method");
    expect(output.notesMarkdown).toContain("## 需要复核");
  });
});
