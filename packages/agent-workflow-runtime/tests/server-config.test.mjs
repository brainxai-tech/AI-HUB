import assert from "node:assert/strict";
import test from "node:test";

import { workflowRetentionDays } from "../src/config.mjs";

test("server wires AIHUB_WORKFLOW_RETENTION_DAYS through bounded parsing", () => {
  assert.equal(workflowRetentionDays({}), 30);
  assert.equal(workflowRetentionDays({ AIHUB_WORKFLOW_RETENTION_DAYS: "14" }), 14);
  assert.equal(workflowRetentionDays({ AIHUB_WORKFLOW_RETENTION_DAYS: "0" }), 1);
  assert.equal(workflowRetentionDays({ AIHUB_WORKFLOW_RETENTION_DAYS: "1000" }), 365);
  assert.equal(workflowRetentionDays({ AIHUB_WORKFLOW_RETENTION_DAYS: "invalid" }), 30);
});
