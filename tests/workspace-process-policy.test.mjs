import assert from "node:assert/strict";
import test from "node:test";

import {
  isTransientWindowsFastFail,
  runWithTransientWindowsRetry,
  WINDOWS_TRANSIENT_FAST_FAIL,
} from "../scripts/workspace-process-policy.mjs";

test("workspace verification retries only the known transient Windows fast-fail", () => {
  assert.equal(isTransientWindowsFastFail("win32", WINDOWS_TRANSIENT_FAST_FAIL), true);
  assert.equal(isTransientWindowsFastFail("win32", WINDOWS_TRANSIENT_FAST_FAIL | 0), true);
  assert.equal(isTransientWindowsFastFail("linux", WINDOWS_TRANSIENT_FAST_FAIL), false);
  assert.equal(isTransientWindowsFastFail("win32", 1), false);
  assert.equal(isTransientWindowsFastFail("win32", null), false);
});

test("process policy retries the transient Windows fast-fail exactly once", () => {
  const results = [
    { status: WINDOWS_TRANSIENT_FAST_FAIL | 0 },
    { status: 0 },
  ];
  let attempts = 0;
  let retries = 0;
  const result = runWithTransientWindowsRetry(
    () => results[attempts++],
    { platform: "win32", onRetry: () => { retries += 1; } },
  );

  assert.equal(result.status, 0);
  assert.equal(attempts, 2);
  assert.equal(retries, 1);
});

test("process policy does not retry ordinary failures or a second fast-fail", () => {
  for (const statuses of [[1, 0], [WINDOWS_TRANSIENT_FAST_FAIL | 0, WINDOWS_TRANSIENT_FAST_FAIL | 0]]) {
    let attempts = 0;
    const result = runWithTransientWindowsRetry(
      () => ({ status: statuses[attempts++] }),
      { platform: "win32" },
    );
    assert.equal(result.status, statuses[Math.min(attempts - 1, statuses.length - 1)]);
    assert.equal(attempts, statuses[0] === 1 ? 1 : 2);
  }
});
