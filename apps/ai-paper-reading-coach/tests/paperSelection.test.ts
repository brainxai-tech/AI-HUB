import { describe, expect, it } from "vitest";
import { parsePaperText } from "../server/paperParser.js";
import { defaultSelectedParagraphId } from "../src/shared/paperSelection.js";

const paperWithFrontMatter = `
Learning to Read Scientific Papers
Jane Doe, Max Researcher

Abstract
This paper studies how novice readers understand dense research articles.

1 Introduction
Reading papers is hard for new researchers because articles assume background knowledge.
`;

describe("paper selection", () => {
  it("starts on the first readable content paragraph instead of front matter", () => {
    const paper = parsePaperText(paperWithFrontMatter);
    const selectedId = defaultSelectedParagraphId(paper);
    const selected = paper.sections.flatMap((section) => section.paragraphs).find((paragraph) => paragraph.id === selectedId);

    expect(selected?.sectionTitle).toBe("Abstract");
    expect(selected?.text).toContain("novice readers");
  });
});
