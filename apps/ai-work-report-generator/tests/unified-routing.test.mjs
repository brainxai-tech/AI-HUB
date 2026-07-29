import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HubRuntimeError,
  resolveHubRuntime,
  writeHubModelSelection,
} from "../dist-server/server/hubRuntime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Hub catalog exposes only the configured GPT route", async () => {
  let captured;
  const runtime = await resolveHubRuntime({
    env: { HUB_PROJECT_TOKEN: "test-project-token" },
    fetcher: async (url, init) => {
      captured = { url: String(url), init };
      return Response.json({
        providers: [
          { id: "legacy-provider", model: "legacy-model", enabled: true, configured: true },
          {
            id: "openai",
            model: "gpt-5.4",
            models: ["gpt-5.4", "legacy-model"],
            enabledModels: ["gpt-5.4-mini", "legacy-model"],
            enabled: true,
            configured: true,
          },
        ],
      });
    },
  });

  assert.equal(runtime.provider, "openai");
  assert.equal(runtime.model, "gpt-5.4");
  assert.deepEqual(runtime.models, ["gpt-5.4-mini", "gpt-5.4"]);
  assert.equal(captured.url, "http://127.0.0.1:4194/hub/api/model-config");
  assert.equal(captured.init.headers["X-Hub-Project-Id"], "ai-work-report-generator");
  assert.equal(captured.init.headers["X-Hub-Project-Path"], "/work-report");
  assert.equal(captured.init.headers["X-Hub-Project-Token"], "test-project-token");
});

test("Hub catalog rejects a non-GPT selected model", async () => {
  await assert.rejects(
    resolveHubRuntime({
      env: {},
      fetcher: async () => Response.json({
        providers: [{ id: "openai", model: "legacy-model", models: ["gpt-5.4"], enabled: true, configured: true }],
      }),
    }),
    (error) => error instanceof HubRuntimeError && error.code === "HUB_PROVIDER_NOT_CONFIGURED",
  );
});

test("project model selection rejects non-GPT models before contacting Hub", async () => {
  await assert.rejects(
    writeHubModelSelection("legacy-model", { fetcher: async () => assert.fail("fetch must not run") }),
    (error) => error instanceof HubRuntimeError && error.code === "PROJECT_MODEL_INVALID",
  );
});

test("release UI and server contain no project key controls or direct provider fallback", async () => {
  const [bundle, contracts, gateway, index] = await Promise.all([
    readFile(resolve(root, "dist/assets/index-hub-routing.js"), "utf8"),
    readFile(resolve(root, "dist-server/src/shared/contracts.js"), "utf8"),
    readFile(resolve(root, "dist-server/server/providerGateway.js"), "utf8"),
    readFile(resolve(root, "dist/index.html"), "utf8"),
  ]);
  assert.doesNotMatch(bundle, /type:[^,}]*password|sessionStorage|apiKey|apiBaseUrl|BYOK/i);
  assert.match(bundle, /shubao-report-history/);
  assert.match(bundle, /localStorage/);
  assert.doesNotMatch(contracts, /apiKey|apiBaseUrl|model:\s*z\./i);
  assert.doesNotMatch(gateway, /Authorization|normalizeChatEndpoint|request\.apiKey|request\.model/i);
  assert.match(gateway, /hubRuntime\.provider !== "openai"/);
  assert.match(gateway, /isGptModel\(hubRuntime\.model\)/);
  assert.match(index, /data-suite-hub="\/hub\/"/);
});
