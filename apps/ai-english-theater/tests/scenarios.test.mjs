import assert from "node:assert/strict";
import test from "node:test";

import { getScenario, listScenarioSummaries, SCENARIOS } from "../src/scenarios.mjs";

test("defines the four requested practice scenes", () => {
  assert.deepEqual(
    SCENARIOS.map((scenario) => scenario.id),
    ["interview", "travel", "negotiation", "campus"]
  );
});

test("scenario summaries expose safe UI data", () => {
  const summaries = listScenarioSummaries();
  assert.equal(summaries.length, 4);
  assert.equal(summaries[0].id, "interview");
  assert.ok(summaries[0].opening);
  assert.ok(Array.isArray(summaries[0].rubric));
});

test("getScenario returns null for unknown scenes", () => {
  assert.equal(getScenario("unknown"), null);
});
