import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDeepSeekMessages,
  buildDeepSeekRepairMessages,
  parseDeepSeekCandidates,
  parseDeepSeekGeneratedResult,
  type DeepSeekCandidate
} from "../lib/deepseek.ts";

const candidates: DeepSeekCandidate[] = [
  {
    id: "idol-a",
    name: "测试爱豆 A",
    summary: "舞台型候选",
    score: 86,
    confidence: 82,
    tags: ["舞台型", "实力派"],
    matchedTags: ["舞台型"],
    entryReasons: ["舞台直拍"],
    dimensionScores: [{ label: "舞台", score: 8, matchedTags: ["舞台型"] }]
  },
  {
    id: "idol-b",
    name: "测试爱豆 B",
    summary: "作品型候选",
    score: 81,
    confidence: 76,
    tags: ["演员型"],
    matchedTags: ["演员型"],
    entryReasons: ["角色混剪"],
    dimensionScores: [{ label: "作品", score: 6, matchedTags: ["演员型"] }]
  }
];

describe("DeepSeek result contract", () => {
  it("builds a JSON-only prompt with candidate context", () => {
    const messages = buildDeepSeekMessages({
      modeName: "体验版",
      userTags: ["舞台型"],
      fixedIdolId: "idol-a",
      candidates
    });

    assert.match(messages[0].content, /JSON/);
    assert.match(messages[0].content, /不可信数据/);
    assert.match(messages[0].content, /固定结果/);
    assert.match(messages[0].content, /idol-a/);
    assert.match(messages[0].content, /summary 80 到 120 字/);
    assert.match(messages[1].content, /idol-a/);
  });

  it("builds a repair prompt when a generated result is too sparse", () => {
    const messages = buildDeepSeekRepairMessages(
      { modeName: "体验版", userTags: ["舞台型"], fixedIdolId: "idol-a", candidates },
      "{\"idolId\":\"idol-a\"}",
      ["summary 少于 60 字。"]
    );

    assert.match(messages[0].content, /重新生成严格 JSON/);
    assert.match(messages[0].content, /固定值：idol-a/);
    assert.match(messages[1].content, /summary 少于 60 字/);
  });

  it("normalizes valid rich DeepSeek JSON and rejects sparse or unknown results", () => {
    const result = parseDeepSeekGeneratedResult(
      JSON.stringify({
        idolId: "idol-a",
        idolName: "测试爱豆 A",
        score: 120,
        confidence: 101,
        summary:
          "你会被测试爱豆 A 吸引，核心不是单一颜值点，而是舞台冲击、清冷气质和实力稳定性叠在一起，适合从高完成度现场开始确认上头感。",
        matchedTags: ["舞台型", "实力派", "清冷"],
        reasons: [
          "你的偏好集中在舞台型和实力派，测试爱豆 A 的候选画像正好把这两类信号放在最前面。",
          "清冷标签让匹配不只停留在热血舞台，也提供了更稳定、更耐看的审美记忆点。",
          "候选资料里的舞台直拍入口很明确，能让用户快速判断表演张力是不是长期有效。",
          "相比作品型候选，测试爱豆 A 更适合用现场表现建立第一波情绪连接。"
        ],
        entryPath: [
          "先看舞台直拍，确认表情管理、节奏和镜头吸引力是否能立刻抓住你。",
          "再补练习室或现场合集，判断实力稳定性是不是只靠单个高光片段。",
          "最后看采访和日常切片，验证清冷气质之外有没有持续陪伴感。"
        ],
        dimensionScores: [
          { label: "舞台", score: 99, matchedTags: ["舞台型"] },
          { label: "审美", score: 7, matchedTags: ["清冷"] },
          { label: "陪伴", score: 5, matchedTags: ["实力派"] }
        ],
        top3: [
          { idolId: "idol-a", idolName: "测试爱豆 A", score: 120, difference: "第一名更偏舞台和清冷审美，适合从现场物料直接入坑。" },
          { idolId: "idol-b", idolName: "测试爱豆 B", score: 80, difference: "第二名更偏作品和角色记忆点，适合作为补剧向备选。" }
        ]
      }),
      candidates
    );

    assert.equal(result?.idolId, "idol-a");
    assert.equal(result?.score, 99);
    assert.equal(result?.confidence, 100);
    assert.equal(result?.dimensionScores[0].score, 20);
    assert.equal(result?.top3.length, 2);

    assert.equal(parseDeepSeekGeneratedResult(JSON.stringify({ idolId: "idol-a", summary: "太短" }), candidates), null);
    assert.equal(parseDeepSeekGeneratedResult(JSON.stringify({ idolId: "missing" }), candidates), null);
    assert.equal(parseDeepSeekGeneratedResult(JSON.stringify({ idolId: "idol-b" }), candidates, "idol-a"), null);
  });

  it("sanitizes candidates before sending fixed context to Hub", () => {
    const parsed = parseDeepSeekCandidates([
      { id: "idol-a", name: "测试爱豆 A", score: 88, confidence: 77, tags: ["舞台型"] },
      { id: "", name: "bad" }
    ]);

    assert.equal(parsed.length, 1);
  });
});
