import assert from "node:assert/strict";
import test from "node:test";

import { resolveUpstreamTimeoutForProject } from "../server.mjs";

test("course generation receives a dedicated long-running upstream timeout", () => {
  const options = {
    defaultTimeoutMs: 60_000,
    courseTimeoutMs: 180_000,
    pptTimeoutMs: 180_000,
  };

  assert.equal(resolveUpstreamTimeoutForProject("ai-course-teaching-assistant", options), 180_000);
  assert.equal(resolveUpstreamTimeoutForProject("ai-ppt-report-coach", options), 180_000);
  assert.equal(resolveUpstreamTimeoutForProject("ai-book-decomposer", options), 60_000);
});
