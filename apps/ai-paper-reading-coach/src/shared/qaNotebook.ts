import {
  evidenceLabels,
  type CoachBlock,
  type CoachOutput,
  type EvidenceKind
} from "./contracts.js";

export type QaHistoryEntry = {
  id: string;
  question: string;
  answer: string;
  refs: string[];
  evidence: EvidenceKind;
  createdAt: string;
  mode: "model";
  uncertainty: string[];
};

type QaHistoryOptions = {
  id?: string;
  createdAt?: string;
  mode?: "model";
};

type StudyNotebookInput = {
  paperTitle: string;
  paperMap: CoachOutput;
  qaHistory: QaHistoryEntry[];
  quiz?: CoachOutput;
};

const ANSWER_HEADINGS = ["直接回答", "模型回答", "可依据的文本", "论文证据"];

export function createQaHistoryEntry(question: string, output: CoachOutput, options: QaHistoryOptions = {}): QaHistoryEntry {
  const answerBlock = pickAnswerBlock(output.blocks);
  return {
    id: options.id || `qa-${Date.now()}`,
    question: question.trim() || output.summary.replace(/^问题[:：]\s*/, "").trim() || "未命名问题",
    answer: answerBlock?.body || output.summary || "没有可记录的回答。",
    refs: uniqueRefs(output.blocks),
    evidence: strongestEvidence(output.blocks),
    createdAt: options.createdAt || new Date().toISOString(),
    mode: options.mode || "model",
    uncertainty: output.uncertainty
  };
}

export function buildStudyNotebookMarkdown(input: StudyNotebookInput) {
  const uncertainties = [
    ...input.paperMap.uncertainty,
    ...input.qaHistory.flatMap((item) => item.uncertainty),
    ...(input.quiz?.uncertainty || [])
  ];

  return [
    `# ${input.paperTitle} 学习笔记`,
    "",
    "## 论文地图",
    "",
    ...markdownBlocks(input.paperMap.blocks, "尚未生成论文地图。"),
    "",
    "## 关键问答",
    "",
    ...markdownQaHistory(input.qaHistory),
    "",
    "## 复习卡片",
    "",
    ...markdownBlocks(input.quiz?.cards || [], "尚未生成复习包。"),
    "",
    "## 需要复核",
    "",
    ...(uncertainties.length ? uncertainties.map((item) => `- ${item}`) : ["- 暂无额外复核项，仍建议对照原文检查引用。"])
  ].join("\n");
}

function pickAnswerBlock(blocks: CoachBlock[]) {
  return (
    blocks.find((block) => ANSWER_HEADINGS.some((heading) => block.heading.includes(heading))) ||
    blocks.find((block) => block.evidence === "based_on_text") ||
    blocks[0]
  );
}

function uniqueRefs(blocks: CoachBlock[]) {
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    for (const ref of block.refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      refs.push(ref);
    }
  }

  return refs;
}

function strongestEvidence(blocks: CoachBlock[]): EvidenceKind {
  if (blocks.some((block) => block.evidence === "based_on_text" && block.refs.length > 0)) return "based_on_text";
  if (blocks.some((block) => block.evidence === "inferred")) return "inferred";
  return "uncertain";
}

function markdownBlocks(blocks: CoachBlock[], emptyText: string) {
  if (blocks.length === 0) return [`- ${emptyText}`];
  return blocks.map((block) => {
    const refs = block.refs.length ? `（${block.refs.join("、")}）` : "";
    return `- **${block.heading}**：${block.body} _${evidenceLabels[block.evidence]}${refs}_`;
  });
}

function markdownQaHistory(history: QaHistoryEntry[]) {
  if (history.length === 0) return ["- 尚未提问。"];
  return history.map((item, index) => {
    const refs = item.refs.length ? `（${item.refs.join("、")}）` : "";
    return `### ${index + 1}. ${item.question}\n\n${item.answer}\n\n_Hub 模型回答 · ${evidenceLabels[item.evidence]}${refs}_`;
  });
}
