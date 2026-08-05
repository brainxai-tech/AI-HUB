import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Hub-managed model credentials", () => {
  it("does not ask the project user for an API key", () => {
    const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(/type=["']password["']/.test(source)).toBe(false);
    expect(/localStorage.*(api.?key|token|secret)/i.test(source)).toBe(false);
    expect(/const hubModel\s*=/.test(source)).toBe(false);
    expect(/页面顶部统一模型选择器/.test(source)).toBe(true);
    expect(/项目内不再配置厂商、模型或 API Key/.test(source)).toBe(true);
  });
});
