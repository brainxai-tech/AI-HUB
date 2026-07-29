import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  buildStoryVisualFallback,
  mapLegacyServerImport,
  remainingProjectIds,
  scopeHubRequest,
  stripProjectBasePath,
} from "./remaining-projects.mjs";

const require = createRequire(import.meta.url);

test("portable legacy adapters use their Express 4 runtime contract", () => {
  const { version } = require("express/package.json");
  assert.match(version, /^4\./);
});

test("legacy server imports resolve through the portable apps root", () => {
  const appsRoot = "C:\\workspace\\AI-HUB\\apps";
  assert.equal(
    mapLegacyServerImport(
      "/home/admin/apps/ai-dream-director/dist-server/server/modelGateway.js",
      appsRoot,
    ),
    new URL("file:///C:/workspace/AI-HUB/apps/ai-dream-director/dist-server/server/modelGateway.js").href,
  );
  assert.equal(
    mapLegacyServerImport(
      "/home/admin/apps/ai-aesthetic-fingerprint/node_modules/express/index.js",
      appsRoot,
    ),
    "express",
  );
});

test("remaining Express adapters include batch four and paper coach", () => {
  assert.deepEqual(remainingProjectIds().sort(), [
    "ai-aesthetic-fingerprint",
    "ai-bedtime-story-factory",
    "ai-cold-start-brand-lab",
    "ai-dream-director",
    "ai-life-version-controller",
    "ai-paper-reading-coach",
    "ai-reality-filter-translator",
  ]);
});

test("project API paths are stripped before Express delegation", () => {
  assert.equal(
    stripProjectBasePath("/dream/api/providers?fresh=1", "/dream"),
    "/api/providers?fresh=1",
  );
});

test("Hub requests receive scoped identity and JSON output mode", () => {
  const scoped = scopeHubRequest(
    "http://127.0.0.1:4194/api/v1/chat/completions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [], stream: false }),
    },
    {
      project: { id: "ai-dream-director", basePath: "/dream", forceJson: true },
      credential: { token: "d".repeat(32) },
      chatUrl: "http://127.0.0.1:4194/hub/api/v1/chat/completions",
    },
  );

  assert.equal(scoped.input, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
  assert.equal(scoped.options.headers.get("x-hub-project-id"), "ai-dream-director");
  assert.equal(scoped.options.headers.get("x-hub-project-token"), "d".repeat(32));
  assert.equal(scoped.options.headers.get("x-hub-project-path"), "/dream");
  assert.deepEqual(JSON.parse(scoped.options.body).response_format, { type: "json_object" });
});

test("non-Hub requests are not given project credentials", () => {
  const options = { headers: { accept: "application/json" } };
  const scoped = scopeHubRequest("https://example.com/data", options, {
    project: { id: "ai-dream-director", basePath: "/dream", forceJson: true },
    credential: { token: "d".repeat(32) },
    chatUrl: "http://127.0.0.1:4194/hub/api/v1/chat/completions",
  });
  assert.equal(scoped.input, "https://example.com/data");
  assert.equal(scoped.options, options);
});

test("story fallback preserves the visual story response contract", () => {
  const story = buildStoryVisualFallback({
    childName: "小宇",
    theme: "勇气与友谊",
    characters: "小狐狸和月亮机器人",
    setting: "会发光的森林",
  });
  assert.equal(typeof story.title, "string");
  assert.equal(typeof story.story, "string");
  assert.equal(typeof story.readAloud, "string");
  assert.ok(story.shareCard.hashtags.length >= 1);
  assert.ok(story.parentNotes.length >= 1);
  assert.equal(typeof story.sequelSeed, "string");
});
