import { describe, expect, it } from "vitest";
import { validateImageFile } from "../src/lib/files";

describe("image file validation", () => {
  it("accepts supported image files under the size cap", () => {
    expect(validateImageFile({ name: "screen.webp", type: "image/webp", size: 1024 })).toBe("");
  });

  it("rejects unsupported image types", () => {
    expect(validateImageFile({ name: "motion.gif", type: "image/gif", size: 1024 })).toContain("JPEG");
  });

  it("rejects files over 5MB", () => {
    expect(validateImageFile({ name: "huge.png", type: "image/png", size: 6 * 1024 * 1024 })).toContain("5MB");
  });
});
