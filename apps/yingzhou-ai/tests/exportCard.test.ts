import { describe, expect, it } from "vitest";
import { cardFilename, sanitizeFilename } from "../src/exportCard";

describe("poem card export helpers", () => {
  it("removes Windows-invalid filename characters", () => {
    expect(sanitizeFilename("咏春风：江南/旧梦?*")).toBe("咏春风江南旧梦");
  });

  it("builds a labeled png filename", () => {
    expect(cardFilename("咏春风")).toMatch(/^吟舟AI-咏春风-\d{4}-\d{2}-\d{2}\.png$/u);
  });
});
