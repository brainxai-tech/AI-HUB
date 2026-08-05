import assert from "node:assert/strict";
import test from "node:test";

import { CozeIntegrationError, runCozeWorkflow, validateCozeRunPayload } from "../integrations/coze.mjs";

const config = {
  enabled: true,
  apiToken: "coze-secret-token-that-must-never-be-returned",
  baseUrl: "https://api.coze.cn",
  workflowId: "workflow-123",
  workflowName: "Resume workflow",
  userId: "user-123",
  fileParameterShape: "file_id_object",
};

test("Coze proxy uploads text and runs the configured workflow without returning its PAT", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/v1/files/upload")) {
      return new Response(JSON.stringify({ code: 0, data: { id: "file-123" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ code: 0, data: { result: "completed" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await runCozeWorkflow(
    config,
    { resumeText: "resume text", jobDescription: "job description", resumeSourceName: "resume.txt" },
    { fetchImpl, timeoutMs: 1000 },
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].init.headers.authorization, `Bearer ${config.apiToken}`);
  assert.equal(requests[1].init.headers.authorization, `Bearer ${config.apiToken}`);
  assert.equal(result.fileId, "file-123");
  assert.equal(result.workflowId, "workflow-123");
  assert.equal(result.result.data.result, "completed");
  assert.equal(JSON.stringify(result).includes(config.apiToken), false);
});

test("Coze proxy validates content and configured origins before outbound requests", async () => {
  assert.throws(() => validateCozeRunPayload({}), CozeIntegrationError);
  await assert.rejects(
    () =>
      runCozeWorkflow(
        { ...config, baseUrl: "http://127.0.0.1:8080" },
        { resumeText: "resume" },
        { fetchImpl: async () => assert.fail("fetch should not run") },
      ),
    (error) => error.code === "COZE_CONFIG_INVALID",
  );
});

test("Coze proxy returns sanitized upstream errors", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ message: `provider echoed ${config.apiToken}` }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    () => runCozeWorkflow(config, { resumeText: "resume" }, { fetchImpl, timeoutMs: 1000 }),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(JSON.stringify(error.body).includes(config.apiToken), false);
      return true;
    },
  );
});
