import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testModes } from "../data/personality-test.ts";
import { buildModeHelperLine } from "../lib/test-mode-copy.ts";

describe("test mode copy", () => {
  it("uses the selected mode estimate in the home helper line", () => {
    const professional = testModes.find((mode) => mode.id === "professional");
    const experience = testModes.find((mode) => mode.id === "experience");

    assert.ok(professional);
    assert.ok(experience);

    assert.equal(
      buildModeHelperLine(professional),
      "预计 4-6 分钟完成，结果可重新测试并复制分享文案。"
    );
    assert.equal(
      buildModeHelperLine(experience),
      "预计 2-3 分钟完成，结果可重新测试并复制分享文案。"
    );
  });
});
