import {
  evidenceLabels,
  type CoachBlock,
  type CoachOutput,
  type EvidenceKind,
  type ParsedPaper,
  type PaperSection
} from "./contracts.js";

type MapSlot = {
  heading: string;
  roles: string[];
  missingLabel: string;
  body: (section: PaperSection) => string;
  evidence?: EvidenceKind;
};

const PAPER_MAP_SLOTS: MapSlot[] = [
  {
    heading: "研究问题",
    roles: ["abstract", "introduction"],
    missingLabel: "Abstract / Introduction",
    body: (section) => `${section.summary} 先用这一段确认论文想解决的问题。`
  },
  {
    heading: "核心贡献",
    roles: ["abstract", "introduction", "conclusion"],
    missingLabel: "Abstract / Introduction / Conclusion",
    body: (section) => `${section.summary} 这里通常包含论文声称带来的新方法、新证据或新视角。`,
    evidence: "inferred"
  },
  {
    heading: "方法路线",
    roles: ["method", "experiment"],
    missingLabel: "Method / Methodology / Approach",
    body: (section) => `${section.summary} 阅读时要检查这个方法是否真正支撑后面的结论。`
  },
  {
    heading: "数据/实验",
    roles: ["experiment", "results"],
    missingLabel: "Experiments / Evaluation / Results",
    body: (section) => `${section.summary} 这里是判断证据强弱的主要位置。`
  },
  {
    heading: "主要结论",
    roles: ["results", "conclusion", "discussion"],
    missingLabel: "Results / Conclusion",
    body: (section) => `${section.summary} 先把结论和支持它的证据分开看。`
  },
  {
    heading: "局限性",
    roles: ["limitations", "discussion"],
    missingLabel: "Limitations / Discussion",
    body: (section) => `${section.summary} 这里需要复核哪些条件下结论可能不成立。`,
    evidence: "inferred"
  }
];

export function buildPaperMapOutput(paper: ParsedPaper): CoachOutput {
  const blocks = PAPER_MAP_SLOTS.map((slot) => blockForSlot(paper, slot));
  const uncertainty = blocks
    .filter((block) => block.evidence === "uncertain")
    .map((block) => `${block.heading} 缺少可定位章节，请复核是否存在 ${missingLabelFor(block.heading)}。`);

  blocks.push({
    heading: "下一步阅读",
    body: nextReadingAdvice(blocks),
    evidence: "inferred",
    refs: []
  });

  return {
    title: "论文地图",
    summary: summaryForMap(paper, blocks),
    blocks,
    cards: [],
    questions: [],
    interviewQuestions: [],
    notesMarkdown: buildPaperMapMarkdown(paper, blocks, uncertainty),
    uncertainty
  };
}

function blockForSlot(paper: ParsedPaper, slot: MapSlot): CoachBlock {
  const section = findSectionByRoles(paper, slot.roles);
  if (!section) {
    return {
      heading: slot.heading,
      body: `没有识别到 ${slot.missingLabel} 相关章节，不能据此补写结论。请粘贴更完整文本或手动检查 PDF 解析结果。`,
      evidence: "uncertain",
      refs: []
    };
  }

  return {
    heading: slot.heading,
    body: slot.body(section),
    evidence: slot.evidence || "based_on_text",
    refs: firstRefs(section)
  };
}

function findSectionByRoles(paper: ParsedPaper, roles: string[]) {
  for (const role of roles) {
    const section = paper.sections.find((item) => item.role === role);
    if (section) return section;
  }

  return undefined;
}

function firstRefs(section: PaperSection) {
  return section.paragraphs.slice(0, 2).map((paragraph) => paragraph.citation);
}

function missingLabelFor(heading: string) {
  return PAPER_MAP_SLOTS.find((slot) => slot.heading === heading)?.missingLabel || "对应章节";
}

function summaryForMap(paper: ParsedPaper, blocks: CoachBlock[]) {
  const cited = blocks.filter((block) => block.refs.length > 0).length;
  const uncertain = blocks.filter((block) => block.evidence === "uncertain").length;
  return `${paper.meta.title} 已整理为 ${cited} 个有引用的阅读节点${uncertain ? `，另有 ${uncertain} 个节点需要人工复核` : ""}。`;
}

function nextReadingAdvice(blocks: CoachBlock[]) {
  const uncertainHeadings = blocks.filter((block) => block.evidence === "uncertain").map((block) => block.heading);
  if (uncertainHeadings.length > 0) {
    return `先复核 ${uncertainHeadings.join("、")}，再继续做逐段解释或问答。`;
  }

  return "先读研究问题和方法路线，再用数据/实验与主要结论互相校验，最后检查局限性。";
}

function buildPaperMapMarkdown(paper: ParsedPaper, blocks: CoachBlock[], uncertainty: string[]) {
  const mapLines = blocks.map((block) => {
    const refs = block.refs.length ? `（${block.refs.join("、")}）` : "";
    return `- **${block.heading}**：${block.body} _${evidenceLabels[block.evidence]}${refs}_`;
  });

  const reviewLines =
    uncertainty.length > 0
      ? uncertainty.map((item) => `- ${item}`)
      : ["- 暂未发现缺失的核心论文地图节点，但仍建议对照原文复核引用段落。"];

  return [
    `# ${paper.meta.title}`,
    "",
    "## 论文地图",
    "",
    ...mapLines,
    "",
    "## 需要复核",
    "",
    ...reviewLines
  ].join("\n");
}
