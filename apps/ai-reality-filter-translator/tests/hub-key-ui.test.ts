import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Hub-managed model credentials", () => {
  it("does not ask the project user for a credential or duplicate model selection", () => {
    const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(/type=["']password["']/.test(source)).toBe(false);
    expect(/setApiKey/.test(source)).toBe(false);
    expect(/<select[^>]*(provider|model)/i.test(source)).toBe(false);
    expect(/切换 GPT 型号请使用页面顶部统一模型选择器/.test(source)).toBe(true);
    expect(/发送给 Hub 当前选择的 GPT 型号/.test(source)).toBe(true);
  });
});
