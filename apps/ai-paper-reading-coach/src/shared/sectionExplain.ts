import {
  evidenceLabels,
  type CoachBlock,
  type CoachOutput,
  type PaperParagraph
} from "./contracts.js";

const TERM_STOPWORDS = new Set([
  "because",
  "between",
  "claims",
  "connect",
  "papers",
  "readers",
  "reading",
  "source",
  "technical",
  "workflow"
]);

export function buildSectionExplainOutput(selected: PaperParagraph | undefined): CoachOutput {
  if (!selected) {
    return {
      title: "选段解释",
      summary: "请先选择论文中的一个段落。",
      blocks: [
        {
          heading: "缺少选段",
          body: "没有选中段落，因此不能解释原文或给出引用。",
          evidence: "uncertain",
          refs: []
        }
      ],
      cards: [],
      questions: [],
      interviewQuestions: [],
      notesMarkdown: "",
      uncertainty: ["缺少选段，请先在论文正文中选择一个段落。"]
    };
  }

  const refs = [selected.citation];
  const blocks: CoachBlock[] = [
    {
      heading: "一句话结论",
      body: selected.summary,
      evidence: "based_on_text",
      refs
    },
    {
      heading: "术语解释",
      body: termExplanation(selected),
      evidence: "based_on_text",
      refs
    },
    {
      heading: "为什么重要",
      body: `这段位于 ${selected.sectionTitle}，通常是在为该章节的主张、方法或证据建立上下文。阅读时要判断它和前后段落的论证关系。`,
      evidence: "inferred",
      refs
    },
    {
      heading: "建议追问",
      body: followUpQuestion(selected),
      evidence: "inferred",
      refs
    }
  ];

  return {
    title: "选段解释",
    summary: `${selected.citation} 已拆成结论、术语、重要性和追问。`,
    blocks,
    cards: [],
    questions: [],
    interviewQuestions: [],
    notesMarkdown: buildSectionNotes(selected, blocks),
    uncertainty: ["本地解释只基于当前段落和章节标题，复杂公式或实验细节需要继续追问模型。"]
  };
}

function termExplanation(selected: PaperParagraph) {
  const terms = extractTerms(selected.text);
  if (terms.length === 0) {
    return "这段没有检测到明显术语；建议重点复述它的主张和证据关系。";
  }

  return `可能需要解释的术语：${terms.join("、")}。先用原文上下文判断这些术语在本文里的具体含义，不要只套通用定义。`;
}

function extractTerms(text: string) {
  const candidates = text.match(/\b[A-Za-z][A-Za-z-]{5,}\b/g) || [];
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (TERM_STOPWORDS.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(candidate);
    if (terms.length >= 6) break;
  }

  return terms;
}

function followUpQuestion(selected: PaperParagraph) {
  const sectionName = selected.sectionTitle || "当前章节";
  return `追问：${sectionName} 中这段的说法，后文是否给出了直接证据、对照实验或边界条件？如果没有，要把它标为待复核。`;
}

function buildSectionNotes(selected: PaperParagraph, blocks: CoachBlock[]) {
  const lines = blocks.map((block) => {
    const refs = block.refs.length ? `（${block.refs.join("、")}）` : "";
    return `- **${block.heading}**：${block.body} _${evidenceLabels[block.evidence]}${refs}_`;
  });

  return [`# ${selected.sectionTitle} ${selected.citation}`, "", "## 选段解释", "", ...lines].join("\n");
}
