import { describe, expect, it } from "vitest";
import { publicAssetPath } from "./public-path";

describe("publicAssetPath", () => {
  it("prefixes metadata assets with the deployed base path", () => {
    expect(publicAssetPath("/icon.svg", "/go/")).toBe("/go/icon.svg");
  });

  it("keeps root-hosted development assets absolute", () => {
    expect(publicAssetPath("icon.svg", "")).toBe("/icon.svg");
  });
});
