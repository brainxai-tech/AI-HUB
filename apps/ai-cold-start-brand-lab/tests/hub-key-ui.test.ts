import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Hub-managed model credentials", () => {
  it("does not ask the project user for an API key", () => {
    const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(/type=["']password["']/.test(source)).toBe(false);
    expect(/form\.apiKey/.test(source)).toBe(false);
    expect(/模型与密钥由 AI Hub 统一管理/.test(source)).toBe(true);
  });

  it("shows generation failures in the result panel with an explicit retry action", () => {
    const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="empty-state generation-error"');
    expect(source).toContain("重试生成");
  });
});
