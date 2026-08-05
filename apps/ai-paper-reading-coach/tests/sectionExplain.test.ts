import { describe, expect, it } from "vitest";
import { parsePaperText } from "../server/paperParser.js";
import { buildSectionExplainOutput } from "../src/shared/sectionExplain.js";

const paperText = `
Attention Reading Assistant

Abstract
This paper studies guided reading for technical papers.

1 Method
The Transformer workflow uses self-attention, evidence cards, and uncertainty labels to help readers connect claims with source paragraphs.
`;

describe("section explain output", () => {
  it("explains a selected paragraph with terms, importance, and follow-up questions tied to the citation", () => {
    const paper = parsePaperText(paperText);
    const selected = paper.sections.find((section) => section.role === "method")?.paragraphs[0];
    const output = buildSectionExplainOutput(selected);

    expect(output.title).toBe("选段解释");
    expect(output.blocks.map((block) => block.heading)).toEqual(
      expect.arrayContaining(["一句话结论", "术语解释", "为什么重要", "建议追问"])
    );
    expect(output.blocks.every((block) => block.refs.includes(selected?.citation || ""))).toBe(true);
    expect(output.blocks.find((block) => block.heading === "术语解释")?.body).toContain("self-attention");
    expect(output.blocks.find((block) => block.heading === "为什么重要")?.evidence).toBe("inferred");
    expect(output.notesMarkdown).toContain(selected?.citation);
  });

  it("stays uncertain when no paragraph is selected", () => {
    const output = buildSectionExplainOutput(undefined);

    expect(output.blocks[0].evidence).toBe("uncertain");
    expect(output.blocks[0].refs).toEqual([]);
    expect(output.uncertainty.join(" ")).toContain("选段");
  });
});
