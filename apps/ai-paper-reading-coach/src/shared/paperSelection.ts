import type { ParsedPaper } from "./contracts.js";

const READABLE_ROLES = new Set([
  "abstract",
  "introduction",
  "background",
  "method",
  "experiment",
  "results",
  "discussion",
  "limitations",
  "conclusion",
  "body"
]);

export function defaultSelectedParagraphId(paper: ParsedPaper) {
  const readable = paper.sections.find((section) => READABLE_ROLES.has(section.role) && section.paragraphs.length > 0);
  if (readable) return readable.paragraphs[0].id;

  return paper.sections[0]?.paragraphs[0]?.id || "";
}
