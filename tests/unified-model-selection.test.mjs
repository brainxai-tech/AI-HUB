import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverRoutingModels,
  isSelectableRoutingModel,
  projectCompatibleConfig,
  resolveProjectModelSelection,
} from "../server.mjs";

function configuredRoutingConfig(models) {
  return {
    defaultProvider: "routing",
    providers: {
      routing: {
        enabled: true,
        apiKey: "test-key",
        baseUrl: "https://drhknode.airouting.com/v1",
        model: "",
        models,
        enabledModels: models,
      },
    },
    integrations: {
      coze: {
        enabled: false,
        apiToken: "",
        baseUrl: "https://api.coze.cn",
        userId: "test-user",
        workflowName: "test-workflow",
        workflowId: "test-id",
        fileParameterShape: "file_id_object",
      },
    },
  };
}

test("AI Routing selections accept only GPT chat models", () => {
  assert.equal(isSelectableRoutingModel("gpt-5.5"), true);
  assert.equal(isSelectableRoutingModel("codex-auto-review"), false);
  assert.equal(isSelectableRoutingModel("gpt-5.3-codex-spark"), true);
  assert.equal(isSelectableRoutingModel("gemini-2.5-pro"), false);
  assert.equal(isSelectableRoutingModel("gpt-image-2"), false);
  assert.equal(isSelectableRoutingModel("claude-sonnet-4-6"), false);
  assert.equal(isSelectableRoutingModel("deepseek-chat"), false);
});

test("model discovery probes only GPT chat models", async () => {
  const probedModels = [];
  const fetcher = async (url, options = {}) => {
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({
        data: [
          { id: "gpt-5.5" },
          { id: "codex-auto-review" },
          { id: "gemini-2.5-pro" },
          { id: "claude-sonnet-4-6" },
          { id: "deepseek-chat" },
          { id: "gpt-image-2" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const body = JSON.parse(options.body);
    probedModels.push(body.model);
    return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const models = await discoverRoutingModels("test-key", { fetcher, concurrency: 1, timeoutMs: 1000 });

  assert.deepEqual(models, ["gpt-5.5"]);
  assert.deepEqual(probedModels.sort(), models);
});

test("an uninitialized project inherits a callable default instead of reporting Hub unconfigured", () => {
  const config = configuredRoutingConfig(["codex-auto-review", "gpt-5.4-mini", "gpt-5.5"]);
  const selection = resolveProjectModelSelection(config, { version: 1, projects: {} }, "example-project");

  assert.equal(selection.model, "gpt-5.4-mini");
  assert.equal(selection.configured, true);
  assert.equal(selection.inherited, true);
  assert.equal(selection.selectionRequired, false);
});

test("project selections can bind a callable relay without exposing its runtime provider id", () => {
  const config = configuredRoutingConfig(["gpt-5.4", "gpt-5.5"]);
  const selection = resolveProjectModelSelection(
    config,
    { version: 2, projects: { "example-project": { relayId: "cheap-relay", model: "gpt-5.5" } } },
    "example-project",
    {
      version: 1,
      providers: [{
        id: "cheap-relay",
        name: "Cheap Relay",
        kind: "relay",
        status: "connected",
        runtimeProviderId: "routing",
        models: ["gpt-5.5"],
      }],
    },
  );

  assert.equal(selection.relayId, "cheap-relay");
  assert.equal(selection.relayName, "Cheap Relay");
  assert.deepEqual(selection.models, ["gpt-5.5"]);
  assert.equal(selection.model, "gpt-5.5");
  assert.equal(selection.configured, true);
  assert.equal(selection.relays[0].runtimeProviderId, undefined);
});

test("project-scoped compatibility exposes only its selected GPT model", () => {
  const config = configuredRoutingConfig(["gpt-5.5", "gpt-5.3-codex-spark"]);
  const selection = resolveProjectModelSelection(
    config,
    { version: 1, projects: { "example-project": "gpt-5.3-codex-spark" } },
    "example-project",
  );
  const publicValue = projectCompatibleConfig(config, selection);

  assert.equal(publicValue.defaultProvider, "openai");
  assert.equal(publicValue.providers.length, 1);
  assert.deepEqual(publicValue.providers[0].models, ["gpt-5.3-codex-spark"]);
  assert.deepEqual(publicValue.providers[0].enabledModels, ["gpt-5.3-codex-spark"]);
  assert.equal(publicValue.providers[0].label, "GPT · AI Routing");
});
