import type { ParsedPaper, PaperMeta, PaperParagraph, PaperSection } from "../src/shared/contracts.js";

type ParsePaperOptions = {
  sourceName?: string;
  sourceUrl?: string;
  authors?: string[];
  pages?: number;
};

type DraftSection = {
  title: string;
  role: string;
  blocks: string[];
};

const HEADING_ROLES: Array<[RegExp, string, string]> = [
  [/^abstract$/i, "abstract", "Abstract"],
  [/^(introduction|intro)$/i, "introduction", "Introduction"],
  [/^(background|related work|literature review)$/i, "background", "Background"],
  [/^(method|methods|methodology|approach|model|materials and methods)$/i, "method", "Method"],
  [/^(experiment|experiments|experimental setup|evaluation|study design)$/i, "experiment", "Experiments"],
  [/^(result|results|findings)$/i, "results", "Results"],
  [/^(discussion|analysis)$/i, "discussion", "Discussion"],
  [/^(limitation|limitations)$/i, "limitations", "Limitations"],
  [/^(conclusion|conclusions|conclusion and future work)$/i, "conclusion", "Conclusion"],
  [/^(references|bibliography)$/i, "references", "References"],
  [/^(acknowledgements|acknowledgments)$/i, "acknowledgements", "Acknowledgements"]
];

const IMPORTANT_ROLES = new Set([
  "abstract",
  "introduction",
  "method",
  "experiment",
  "results",
  "discussion",
  "limitations",
  "conclusion"
]);

export function parsePaperText(rawText: string, options: ParsePaperOptions = {}): ParsedPaper {
  const cleaned = sanitizePaperText(rawText);
  const blocks = toBlocks(cleaned);
  const title = inferTitle(blocks);
  const meta: PaperMeta = {
    title,
    sourceName: options.sourceName,
    sourceUrl: options.sourceUrl,
    authors: options.authors || inferAuthors(blocks, title),
    importedAt: new Date().toISOString()
  };

  const drafts = buildDraftSections(blocks, title);
  const sections = materializeSections(drafts);
  const usableSections = sections.some((section) => IMPORTANT_ROLES.has(section.role))
    ? sections
    : chunkPlainText(cleaned, title);

  return {
    meta,
    rawText: cleaned,
    sections: usableSections,
    stats: {
      characters: cleaned.length,
      words: countWords(cleaned),
      sections: usableSections.length,
      paragraphs: usableSections.reduce((total, section) => total + section.paragraphs.length, 0),
      pages: options.pages
    }
  };
}

export function summarizeForContext(
  paper: ParsedPaper,
  options: { selectedParagraphId?: string; maxChars?: number } = {}
) {
  const sectionSummaries = paper.sections.map((section) => ({
    id: section.id,
    title: section.title,
    role: section.role,
    summary: section.summary
  }));

  const selected = options.selectedParagraphId
    ? findParagraphWindow(paper, options.selectedParagraphId)
    : pickImportantParagraphs(paper);

  return {
    paperMeta: paper.meta,
    sectionSummaries,
    surroundingContext: limitText(
      selected
        .map((paragraph) => `${paragraph.citation} [${paragraph.sectionTitle}] ${paragraph.text}`)
        .join("\n\n"),
      options.maxChars || 7_000
    )
  };
}

export function sanitizePaperText(rawText: string) {
  return String(rawText || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => !/^\d{1,4}$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDraftSections(blocks: string[], title: string): DraftSection[] {
  const drafts: DraftSection[] = [];
  let current: DraftSection = {
    title: "Front Matter",
    role: "frontmatter",
    blocks: []
  };
  let skippedTitle = false;

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!skippedTitle && normalizeHeading(lines[0] || "") === normalizeHeading(title)) {
      skippedTitle = true;
      const rest = lines.slice(1).join("\n").trim();
      if (rest) current.blocks.push(rest);
      continue;
    }

    const split = splitHeadingFromBlock(block);
    if (split) {
      if (current.blocks.length > 0 || current.role !== "frontmatter") {
        drafts.push(current);
      }
      current = {
        title: split.title,
        role: split.role,
        blocks: split.rest ? [split.rest] : []
      };
      continue;
    }

    current.blocks.push(block);
  }

  if (current.blocks.length > 0 || current.role !== "frontmatter") {
    drafts.push(current);
  }

  return drafts.filter((section) => section.blocks.length > 0 && section.role !== "references");
}

function materializeSections(drafts: DraftSection[]): PaperSection[] {
  return drafts.map((draft, sectionIndex) => {
    const sectionId = `s${sectionIndex + 1}`;
    const paragraphs = splitParagraphs(draft.blocks.join("\n\n")).map((text, paragraphIndex) => {
      const citation = `S${sectionIndex + 1}-P${paragraphIndex + 1}`;
      return {
        id: `${sectionId}-p${paragraphIndex + 1}`,
        sectionId,
        sectionTitle: draft.title,
        index: paragraphIndex + 1,
        text,
        summary: summarizeText(text, 180),
        citation
      } satisfies PaperParagraph;
    });

    return {
      id: sectionId,
      title: draft.title,
      role: draft.role,
      summary: summarizeText(paragraphs.map((paragraph) => paragraph.summary).join(" "), 260),
      paragraphs
    };
  });
}

function chunkPlainText(text: string, title: string): PaperSection[] {
  const paragraphs = splitParagraphs(text);
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const words = countWords(paragraph);
    if (current.length > 0 && currentWords + words > 450) {
      chunks.push(current);
      current = [];
      currentWords = 0;
    }
    current.push(paragraph);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((chunk, sectionIndex) => {
    const sectionId = `s${sectionIndex + 1}`;
    const paragraphsForSection = chunk.map((paragraph, paragraphIndex) => ({
      id: `${sectionId}-p${paragraphIndex + 1}`,
      sectionId,
      sectionTitle: sectionIndex === 0 ? title : `Chunk ${sectionIndex + 1}`,
      index: paragraphIndex + 1,
      text: paragraph,
      summary: summarizeText(paragraph, 180),
      citation: `S${sectionIndex + 1}-P${paragraphIndex + 1}`
    }));

    return {
      id: sectionId,
      title: sectionIndex === 0 ? title : `Chunk ${sectionIndex + 1}`,
      role: sectionIndex === 0 ? "abstract" : "body",
      summary: summarizeText(chunk.join(" "), 260),
      paragraphs: paragraphsForSection
    };
  });
}

function splitHeadingFromBlock(block: string) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const match = detectHeading(lines[0]);
  if (!match) return null;

  return {
    title: match.title,
    role: match.role,
    rest: lines.slice(1).join("\n").trim()
  };
}

function detectHeading(line: string) {
  const normalized = normalizeHeading(line);
  const withoutNumber = normalized.replace(/^\d+(\.\d+)*\s+/, "");
  if (withoutNumber.length > 72) return null;

  for (const [pattern, role, fallbackTitle] of HEADING_ROLES) {
    if (pattern.test(withoutNumber)) {
      return {
        role,
        title: titleCase(withoutNumber || fallbackTitle)
      };
    }
  }

  const numbered = normalized.match(/^(\d+(\.\d+)*)\s+(.{3,70})$/);
  if (numbered && /^[A-Za-z][A-Za-z\s:&/-]+$/.test(numbered[3])) {
    const title = titleCase(numbered[3]);
    return {
      role: roleForTitle(title),
      title
    };
  }

  return null;
}

function roleForTitle(title: string) {
  const normalized = normalizeHeading(title);
  const match = HEADING_ROLES.find(([pattern]) => pattern.test(normalized));
  return match ? match[1] : "body";
}

function inferTitle(blocks: string[]) {
  for (const block of blocks) {
    const line = block.split("\n")[0]?.trim() || "";
    const isCandidate =
      line.length >= 6 && line.length <= 180 && !detectHeading(line) && !/@/.test(line);
    if (isCandidate) {
      return summarizeText(line, 120);
    }
  }

  const fallback = blocks[0]?.replace(/\n+/g, " ") || "未命名论文";
  return summarizeText(fallback, 120);
}

function inferAuthors(blocks: string[], title: string) {
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const titleLineIndex = lines.findIndex((line) => normalizeHeading(line) === normalizeHeading(title));
    const maybeAuthors = titleLineIndex >= 0 ? lines[titleLineIndex + 1] || "" : "";
    if (!maybeAuthors || maybeAuthors.length > 240 || detectHeading(maybeAuthors)) continue;

    return maybeAuthors
      .replace(/\d+/g, "")
      .split(/,|;|\band\b/)
      .map((author) => author.trim())
      .filter((author) => author.length >= 3 && author.length <= 80)
      .slice(0, 12);
  }

  return [];
}

function toBlocks(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string) {
  const base = toBlocks(text).length > 1 ? toBlocks(text) : sentenceChunks(text, 850);
  return base.flatMap((block) => (block.length > 1_300 ? sentenceChunks(block, 900) : [block]));
}

function sentenceChunks(text: string, maxChars: number) {
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${sentence} `;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [limitText(text.replace(/\n+/g, " "), maxChars)];
}

function findParagraphWindow(paper: ParsedPaper, paragraphId: string) {
  const all = paper.sections.flatMap((section) => section.paragraphs);
  const index = all.findIndex((paragraph) => paragraph.id === paragraphId);
  if (index < 0) return pickImportantParagraphs(paper);

  const window = all.slice(Math.max(0, index - 2), Math.min(all.length, index + 3));
  const section = paper.sections.find((item) => item.id === all[index].sectionId);
  const sectionHead = section?.paragraphs.slice(0, 2) || [];
  return uniqueParagraphs([...sectionHead, ...window]);
}

function pickImportantParagraphs(paper: ParsedPaper) {
  const selected: PaperParagraph[] = [];
  for (const section of paper.sections) {
    if (IMPORTANT_ROLES.has(section.role) || selected.length < 4) {
      selected.push(...section.paragraphs.slice(0, 2));
    }
    if (selected.length >= 14) break;
  }
  return uniqueParagraphs(selected).slice(0, 14);
}

function uniqueParagraphs(paragraphs: PaperParagraph[]) {
  const seen = new Set<string>();
  return paragraphs.filter((paragraph) => {
    if (seen.has(paragraph.id)) return false;
    seen.add(paragraph.id);
    return true;
  });
}

function normalizeHeading(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[:.]+$/g, "")
    .trim()
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function summarizeText(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const firstSentence = normalized.match(/^.{20,}?[.!?。！？](\s|$)/)?.[0]?.trim();
  return limitText(firstSentence || normalized, maxChars);
}

function limitText(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1).trim()}…`;
}

function countWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0;
  const cjkChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return latinWords + cjkChars;
}
