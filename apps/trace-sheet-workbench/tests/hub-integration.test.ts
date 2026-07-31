import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeHubProviderCatalog } from "../src/lib/hub-models";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (path: string) => readFileSync(resolve(projectRoot, path), "utf8");

describe("AI HUB integration", () => {
  it("loads the shared suite shell before hydration with a stable project identity", () => {
    const layout = readProjectFile("app/layout.tsx");

    expect(layout).toContain('data-suite-id="trace-sheet-workbench"');
    expect(layout).toContain('src="/hub/suite-shell.js');
    expect(layout).toContain('strategy="beforeInteractive"');
  });

  it("supports the immutable /tracesheet deployment base path", () => {
    const config = readProjectFile("next.config.ts");
    const workbench = readProjectFile("src/components/TraceWorkbench.tsx");

    expect(config).toContain("process.env.BASE_PATH");
    expect(config).toContain("process.env.NEXT_PUBLIC_BASE_PATH");
    expect(workbench).toContain('process.env.NEXT_PUBLIC_BASE_PATH || ""');
    expect(workbench).toContain('`${API_BASE_PATH}/api/plan`');
  });

  it("routes model planning through the Hub without a standalone supplier key", () => {
    const route = readProjectFile("app/api/plan/route.ts");
    const gateway = readProjectFile("src/lib/hub-models.ts");

    expect(route).toContain("getProviderCatalog");
    expect(route).toContain("callHubChat");
    expect(route).toContain("buildLocalPlan");
    expect(gateway).toContain('export type Provider = "routing"');
    expect(gateway).toContain('const PROJECT_ID = "trace-sheet-workbench"');
    expect(gateway).toContain('const PROJECT_PATH = "/tracesheet"');
    expect(gateway).toContain("/^gpt-/i");
    expect(route).not.toContain("AI_API_KEY");
    expect(gateway).not.toContain("deepseek");
    expect(gateway).not.toContain("anthropic");
    expect(gateway).not.toContain("gemini");
    expect(route).not.toContain("Authorization");
    expect(route).not.toContain("Bearer ");
  });

  it("normalizes the Hub project compatibility alias to the internal GPT route", () => {
    const [provider] = normalizeHubProviderCatalog({
      providers: [{
        id: "openai",
        label: "GPT · AI Routing",
        model: "gpt-5.6-luna",
        models: ["gpt-5.6-luna", "claude-opus-4-8"],
        enabledModels: ["gpt-5.6-luna", "gemini-3.5-flash"],
        enabled: true,
        configured: true,
      }],
    });

    expect(provider.id).toBe("routing");
    expect(provider.defaultModel).toBe("gpt-5.6-luna");
    expect(provider.models).toEqual(["gpt-5.6-luna"]);
    expect(provider.enabledModels).toEqual(["gpt-5.6-luna"]);
    expect(provider.enabled).toBe(true);
    expect(provider.configured).toBe(true);
  });
});
