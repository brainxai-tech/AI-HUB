import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFallbackExplanation } from "../lib/explanation.ts";

describe("match explanation", () => {
  it("creates a safe entertainment-only explanation without an external model", () => {
    const explanation = buildFallbackExplanation({
      idolName: "王一博",
      userTags: ["清冷", "舞台型", "实力派"],
      matchedTags: ["清冷", "舞台型"],
      entryReasons: ["出圈舞台直拍", "代表作品/角色混剪"]
    });

    assert.match(explanation, /娱乐向/);
    assert.match(explanation, /王一博/);
    assert.match(explanation, /清冷/);
    assert.ok(explanation.length <= 220);
  });
});
