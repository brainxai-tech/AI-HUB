import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPosterFilename, buildSharePosterLines, buildShareText } from "../lib/share.ts";

describe("share text", () => {
  it("builds a compact shareable idol match result", () => {
    const text = buildShareText({
      modeName: "体验版",
      idolName: "王一博",
      score: 88,
      tags: ["清冷", "舞台型", "实力派"]
    });

    assert.match(text, /爱豆匹配测试/);
    assert.match(text, /体验版/);
    assert.match(text, /王一博/);
    assert.match(text, /88/);
    assert.ok(text.length <= 120);
  });

  it("builds poster lines with match score, confidence, and entry hooks", () => {
    const lines = buildSharePosterLines({
      modeName: "专业版",
      idolName: "王一博",
      score: 91,
      confidence: 86,
      tags: ["清冷", "舞台型", "实力派", "反差型"],
      topReasons: ["舞台直拍", "角色混剪"]
    });

    assert.equal(lines[0], "爱豆匹配测试");
    assert.ok(lines.some((line) => line.includes("专业版")));
    assert.ok(lines.some((line) => line.includes("91")));
    assert.ok(lines.some((line) => line.includes("86%")));
    assert.ok(lines.some((line) => line.includes("舞台直拍")));
  });

  it("creates a filesystem-safe poster filename", () => {
    assert.equal(buildPosterFilename("王/一博?", "体验版"), "idol-match-体验版-王一博.png");
  });
});
