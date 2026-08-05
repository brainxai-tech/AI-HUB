import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { adapter } from "../../../skills/operate-trace-sheet/scripts/adapter.mjs";
import { FileRunStore } from "../src/run-store.mjs";
import { SkillRegistry } from "../src/skill-registry.mjs";
import { WorkflowRunner } from "../src/workflow-runner.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const skillsRoot = path.join(repositoryRoot, "skills");
const metadataInput = {
  goal: "按订单号去重",
  context: {
    activeSourceId: "source-01",
    sources: [{
      id: "source-01",
      name: "订单表",
      fileName: "orders.xlsx",
      sheetName: "Sheet1",
      columns: ["订单号"],
      rowCount: 100,
    }],
  },
};

test("TraceSheet workflow preserves revisions and completes from a bounded browser receipt", async () => {
  const requests = [];
  const client = traceClient(requests);
  const now = monotonicClock();
  const started = await adapter.start({ input: metadataInput, client, now });

  assert.equal(started.checkpoint.id, "review-plan");
  assert.equal(started.context.planRevisions[0].plan.steps[0].risk, "HIGH");
  assert.deepEqual(requests[0].body, metadataInput);

  const originalPlan = structuredClone(started.context.planRevisions[0].plan);
  const revised = await adapter.action({
    run: { status: "waiting", checkpoint: started.checkpoint, context: started.context },
    actionId: "revise-plan",
    input: { goal: "按订单号去重并保留最后一条", notes: "调整保留规则" },
    client,
    now,
  });
  assert.equal(revised.context.planRevisions.length, 2);
  assert.deepEqual(revised.context.planRevisions[0].plan, originalPlan);
  assert.notEqual(revised.context.planRevisions[1].plan.id, originalPlan.id);

  const approved = await adapter.resume({
    run: { context: revised.context },
    checkpointId: "review-plan",
    input: { approved: true, notes: "浏览器差异预览已核对" },
    now,
  });
  assert.equal(approved.checkpoint.id, "execution-receipt");

  const completed = await adapter.resume({
    run: { context: approved.context },
    checkpointId: "execution-receipt",
    input: {
      receipt: {
        finalVersionId: "version-02",
        inputRows: 100,
        outputRows: 98,
        changedRows: 2,
        warnings: ["删除了 2 个重复行"],
        auditHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    },
    now,
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.context.receipt.outputRows, 98);
  assert.equal(completed.result.audit.rawSpreadsheetPersisted, false);
  assert.equal(hasForbiddenKey(completed), false);
});

test("TraceSheet prepare rejects raw spreadsheet keys recursively but not matching values", async () => {
  for (const input of [
    { rows: [] },
    { context: { nested: [{ cells: [] }] } },
    { receipt: { details: { data: [] } } },
  ]) {
    await assert.rejects(
      adapter.prepare({ type: "start", input }),
      (error) => error?.code === "VALIDATION_ERROR",
    );
  }

  const allowedMetadata = structuredClone(metadataInput);
  allowedMetadata.goal = "normalize data rows";
  allowedMetadata.context.sources[0].name = "rows database";
  assert.deepEqual(await adapter.prepare({ type: "start", input: allowedMetadata }), allowedMetadata);
});

test("forbidden TraceSheet input is rejected before any run file or pending command is persisted", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "aihub-trace-privacy-"));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const registry = await new SkillRegistry(skillsRoot).load();
  const store = new FileRunStore(directory);
  const runner = new WorkflowRunner({
    registry,
    store,
    client: traceClient([]),
    now: monotonicClock(),
    createId: () => "00000000-0000-4000-8000-000000000001",
  });

  await assert.rejects(
    runner.create("operate-trace-sheet", {
      ...metadataInput,
      context: {
        ...metadataInput.context,
        sources: [{ ...metadataInput.context.sources[0], rows: [{ secret: "must-not-persist" }] }],
      },
    }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
  assert.deepEqual(await readdir(directory), []);

  const created = await runner.create("operate-trace-sheet", {
    ...metadataInput,
    records: [{ secret: "record-must-not-persist" }],
    context: {
      ...metadataInput.context,
      sources: [{
        ...metadataInput.context.sources[0],
        samples: [{ secret: "sample-must-not-persist" }],
        contentHash: "content-hash-must-not-persist",
      }],
    },
  });
  const pathname = path.join(directory, `${created.id}.json`);
  const before = await readFile(pathname, "utf8");
  assert.equal(before.includes("record-must-not-persist"), false);
  assert.equal(before.includes("sample-must-not-persist"), false);
  assert.equal(before.includes("content-hash-must-not-persist"), false);
  await assert.rejects(
    runner.action(created.id, "revise-plan", { goal: "继续去重", nested: { data: ["must-not-persist"] } }),
    (error) => error?.code === "VALIDATION_ERROR",
  );
  assert.equal(await readFile(pathname, "utf8"), before);
  assert.equal(before.includes("must-not-persist"), false);
});

function traceClient(requests) {
  return {
    async requestJson(service, requestPath, options) {
      assert.equal(service, "tracesheet");
      assert.equal(requestPath, "/api/plan");
      requests.push(structuredClone(options));
      const sequence = requests.length;
      return {
        mode: "AI",
        notice: "仅使用元数据生成计划",
        plan: {
          id: `plan-${sequence}`,
          schemaVersion: "1.0",
          goal: options.body.goal,
          sourceId: options.body.context.activeSourceId,
          createdAt: `2026-08-04T00:00:0${sequence}.000Z`,
          generatedBy: "AI",
          steps: [{
            id: `step-${sequence}`,
            title: "按订单号去重",
            reason: "订单号应唯一",
            risk: "LOW",
            operation: { op: "DEDUP", keys: ["订单号"], keep: sequence === 1 ? "FIRST" : "LAST" },
          }],
        },
      };
    },
  };
}

function monotonicClock() {
  let tick = 0;
  return () => `2026-08-04T00:01:${String(tick++).padStart(2, "0")}.000Z`;
}

function hasForbiddenKey(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, nested]) => (
    new Set(["rows", "cells", "data"]).has(key.toLowerCase()) || hasForbiddenKey(nested, seen)
  ));
}
