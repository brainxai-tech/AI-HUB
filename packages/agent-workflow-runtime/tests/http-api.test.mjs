import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowHttpServer } from "../src/http-api.mjs";

test("HTTP API requires its optional bearer token and never caches workflow data", async (t) => {
  const registry = { list: () => [{ id: "sample" }] };
  const runner = {
    async create(skillId, input) { return { id: "sample-00000000", skillId, input, status: "waiting" }; },
  };
  const server = createWorkflowHttpServer({ runner, registry, apiToken: "secret-token" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();

  const denied = await fetch(`http://127.0.0.1:${port}/api/skills`);
  assert.equal(denied.status, 401);

  const response = await fetch(`http://127.0.0.1:${port}/api/runs`, {
    method: "POST",
    headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
    body: JSON.stringify({ skillId: "sample", input: { safe: true } }),
  });
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.run.skillId, "sample");
});
