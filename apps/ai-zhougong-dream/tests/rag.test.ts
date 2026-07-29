import { describe, expect, it } from "vitest";
import { retrieveZhougongContext } from "../server/rag/retriever";

describe("retrieveZhougongContext", () => {
  it("retrieves traditional lines for common dream images", () => {
    const hits = retrieveZhougongContext("我梦见一条蛇在水边游过，天上下着雨。", 5);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].original).toMatch(/蛇/);
    expect(hits.some((hit) => /蛇|水|雨/.test(hit.original))).toBe(true);
  });

  it("retrieves study or exam-adjacent context", () => {
    const hits = retrieveZhougongContext("我梦见考试迟到，在学校找不到教室。", 5);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => /書|筆|學|文|試|官/.test(hit.original))).toBe(true);
  });

  it("returns a fallback citation when no source lines match", () => {
    const hits = retrieveZhougongContext("我梦见一台完全透明的未来电脑在云端自动写代码。", 5);

    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe("zhougong-no-direct-hit");
  });
});
