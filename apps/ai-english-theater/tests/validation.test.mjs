import assert from "node:assert/strict";
import test from "node:test";

import { ApiProblem, parseEvaluationRequest, parsePracticeRequest } from "../src/validation.mjs";

test("practice request validates provider, scene, level, tone, and messages", () => {
  const request = parsePracticeRequest({
    provider: "Anthropic",
    sceneId: "interview",
    level: "B2",
    tone: "supportive",
    model: "",
    messages: [
      { role: "assistant", kind: "hint", content: "Try a clearer opening." },
      { role: "user", content: "Thank you." }
    ]
  });
  assert.equal(request.provider, "anthropic");
  assert.equal(request.scenario.id, "interview");
  assert.equal(request.messages[0].role, "assistant");
});

test("unknown providers fail with a validation problem", () => {
  assert.throws(
    () =>
      parsePracticeRequest({
        provider: "other",
        sceneId: "interview"
      }),
    ApiProblem
  );
});

test("evaluation requires conversation evidence", () => {
  assert.throws(
    () =>
      parseEvaluationRequest({
        provider: "openai",
        sceneId: "travel",
        messages: [{ role: "user", content: "Hello" }]
      }),
    /at least two messages/
  );
});
