import { describe, expect, it } from "vitest";
import type { CoachOutput } from "../src/shared/contracts.js";
import { buildStudyNotebookMarkdown, createQaHistoryEntry } from "../src/shared/qaNotebook.js";

const paperMap: CoachOutput = {
  title: "论文地图",
  summary: "map",
  blocks: [
    {
      heading: "研究问题",
      body: "论文研究如何让读者用证据阅读论文。",
      evidence: "based_on_text",
      refs: ["S2-P1"]
    }
  ],
  cards: [],
  questions: [],
  interviewQuestions: [],
  notesMarkdown: "",
  uncertainty: []
};

const qaOutput: CoachOutput = {
  title: "问题回答",
  summary: "问题：创新点是什么？",
  blocks: [
    {
      heading: "直接回答",
      body: "创新点是把 claims、evidence 和 review prompts 串成阅读流程。",
      evidence: "based_on_text",
      refs: ["S2-P1", "S3-P1"]
    },
    {
      heading: "边界",
      body: "扫描 PDF 没有文本层时证据会不足。",
      evidence: "inferred",
      refs: ["S6-P1"]
    }
  ],
  cards: [],
  questions: [],
  interviewQuestions: [],
  notesMarkdown: "",
  uncertainty: ["需要模型进一步检查实验细节。"]
};

const quizOutput: CoachOutput = {
  title: "复习包",
  summary: "quiz",
  blocks: [],
  cards: [
    {
      heading: "证据标签",
      body: "区分基于论文文本、推测和不确定。",
      evidence: "based_on_text",
      refs: ["S6-P1"]
    }
  ],
  questions: [],
  interviewQuestions: [],
  notesMarkdown: "",
  uncertainty: []
};

describe("QA notebook", () => {
  it("creates a cited QA history entry from coach output", () => {
    const entry = createQaHistoryEntry("创新点是什么？", qaOutput, {
      id: "qa-1",
      createdAt: "2026-07-01T10:00:00.000Z",
      mode: "model"
    });

    expect(entry.question).toBe("创新点是什么？");
    expect(entry.answer).toContain("claims");
    expect(entry.refs).toEqual(["S2-P1", "S3-P1", "S6-P1"]);
    expect(entry.evidence).toBe("based_on_text");
  });

  it("exports study notes with paper map, key QA, review cards, and uncertainties", () => {
    const entry = createQaHistoryEntry("创新点是什么？", qaOutput, {
      id: "qa-1",
      createdAt: "2026-07-01T10:00:00.000Z",
      mode: "model"
    });
    const markdown = buildStudyNotebookMarkdown({
      paperTitle: "Learning to Read Scientific Papers",
      paperMap,
      qaHistory: [entry],
      quiz: quizOutput
    });

    expect(markdown).toContain("# Learning to Read Scientific Papers 学习笔记");
    expect(markdown).toContain("## 论文地图");
    expect(markdown).toContain("研究问题");
    expect(markdown).toContain("## 关键问答");
    expect(markdown).toContain("创新点是什么？");
    expect(markdown).toContain("S2-P1");
    expect(markdown).toContain("## 复习卡片");
    expect(markdown).toContain("证据标签");
    expect(markdown).toContain("## 需要复核");
    expect(markdown).toContain("实验细节");
  });
});
