import { describe, expect, it } from "vitest";
import { parsePaperText, summarizeForContext } from "../server/paperParser.js";

const samplePaper = `
Learning to Read Scientific Papers
Jane Doe, Max Researcher

Abstract
This paper studies how novice readers understand dense research articles. We introduce a guided reading workflow that breaks papers into claims, evidence, and review prompts.

1 Introduction
Reading papers is hard for new researchers because articles assume background knowledge. A coach can reduce confusion by naming the role of each section.

2 Method
We collected annotations from graduate students and compared guided reading against unguided reading.

3 Results
Participants using the coach produced more accurate summaries and asked more targeted follow-up questions.

4 Discussion
The workflow is most useful when readers can see uncertainty labels and source paragraphs.
`;

describe("paper parser", () => {
  it("extracts title, sections, paragraphs, and stable citation ids", () => {
    const paper = parsePaperText(samplePaper, {
      sourceName: "sample.txt"
    });

    expect(paper.meta.title).toBe("Learning to Read Scientific Papers");
    expect(paper.sections.map((section) => section.role)).toContain("abstract");
    expect(paper.sections.map((section) => section.role)).toContain("method");
    expect(paper.sections.map((section) => section.role)).toContain("results");
    expect(paper.sections[0].paragraphs[0].citation).toMatch(/^S\d+-P\d+$/);
    expect(paper.stats.paragraphs).toBeGreaterThan(3);
  });

  it("creates compact model context with section titles and paragraph citations", () => {
    const paper = parsePaperText(samplePaper);
    const context = summarizeForContext(paper, { selectedParagraphId: "s3-p1" });

    expect(context.sectionSummaries.length).toBeGreaterThan(2);
    expect(context.surroundingContext).toContain("S3-P1");
    expect(context.surroundingContext.length).toBeLessThan(8_000);
  });

  it("falls back to chunked sections when headings are missing", () => {
    const plainText = Array.from({ length: 80 }, (_, index) => `Sentence ${index + 1} explains a claim.`).join(" ");
    const paper = parsePaperText(plainText);

    expect(paper.sections.length).toBeGreaterThan(0);
    expect(paper.sections[0].paragraphs.length).toBeGreaterThan(0);
    expect(paper.meta.title).toContain("Sentence 1");
  });
});
