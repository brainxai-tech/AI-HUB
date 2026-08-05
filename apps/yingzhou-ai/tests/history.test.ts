import { describe, expect, it } from "vitest";
import { createHistory, pushVersion, redoVersion, undoVersion } from "../src/state/history";

describe("poem version history", () => {
  it("pushes, undoes and redoes poem versions", () => {
    const first = ["疏雨入空庭", "微灯照晚晴", "一舟随月远", "心与暮云平"];
    const second = [...first];
    second[2] = "孤舟随月远";
    const changed = pushVersion(createHistory(first), second);
    expect(changed.index).toBe(1);
    expect(undoVersion(changed).entries[0][2]).toBe("一舟随月远");
    expect(redoVersion(undoVersion(changed)).entries[1][2]).toBe("孤舟随月远");
  });

  it("drops redo entries after editing an undone version", () => {
    const first = ["一", "二", "三", "四"];
    const second = ["甲", "二", "三", "四"];
    const third = ["乙", "二", "三", "四"];
    const state = undoVersion(pushVersion(pushVersion(createHistory(first), second), third));
    const branched = pushVersion(state, ["丙", "二", "三", "四"]);
    expect(branched.entries).toEqual([first, second, ["丙", "二", "三", "四"]]);
    expect(branched.index).toBe(2);
  });

  it("does not create duplicate adjacent versions", () => {
    const first = ["一", "二", "三", "四"];
    expect(pushVersion(createHistory(first), [...first]).entries).toHaveLength(1);
  });
});
