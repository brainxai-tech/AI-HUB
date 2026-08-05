import { describe, expect, it } from "vitest";
import { wrapTextLines } from "../src/share";

describe("wrapTextLines", () => {
  it("wraps text by measured width", () => {
    const context = {
      measureText: (text: string) => ({ width: text.length * 10 })
    } as Pick<CanvasRenderingContext2D, "measureText">;

    expect(wrapTextLines(context, "一二三四五六", 30)).toEqual(["一二三", "四五六"]);
  });
});
