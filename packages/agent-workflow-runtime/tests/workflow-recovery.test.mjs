import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { publicError } from "../src/errors.mjs";
import { FileRunStore } from "../src/run-store.mjs";
import { WorkflowRunner } from "../src/workflow-runner.mjs";

test("a rejected resume keeps its checkpoint and accepts corrected input", async (t) => {
  const { runner } = await harness(t, {
    async start() { return waitingTransition(); },
    async resume({ input }) {
      if (!input?.approved) throw validationError("approved is required");
      return { status: "completed", step: "done", result: { approved: true } };
    },
  });

  const created = await runner.create("sample-skill", {});
  const rejected = await runner.resume(created.id, { approved: false });
  assert.equal(rejected.status, "waiting");
  assert.equal(rejected.checkpoint.id, "approval");
  assert.equal(rejected.error.code, "VALIDATION_ERROR");
  assert.equal(rejected.pendingCommand, null);

  const corrected = await runner.resume(created.id, { approved: true });
  assert.equal(corrected.status, "completed");
  assert.deepEqual(corrected.result, { approved: true });
});

test("a transient action retry receives the original waiting state and calls upstream again", async (t) => {
  let attempts = 0;
  const { runner } = await harness(t, {
    async start() { return waitingTransition(); },
    async action({ run }) {
      attempts += 1;
      assert.equal(run.status, "waiting");
      if (attempts === 1) throw new Error("temporary upstream failure");
      return {
        ...waitingTransition(),
        actionResult: { adjusted: true },
      };
    },
  });

  const created = await runner.create("sample-skill", {});
  const failed = await runner.action(created.id, "adjust", {});
  assert.equal(failed.status, "failed");
  assert.equal(failed.pendingCommand.originStatus, "waiting");

  const retried = await runner.retry(created.id);
  assert.equal(retried.status, "waiting");
  assert.deepEqual(retried.lastAction, { adjusted: true });
  assert.equal(attempts, 2);
});

test("a rejected action preserves the waiting run and accepts corrected input", async (t) => {
  const { runner } = await harness(t, {
    async start() { return waitingTransition(); },
    async action({ input }) {
      if (!input?.mealKey) throw validationError("mealKey is required");
      return {
        ...waitingTransition(),
        actionResult: { mealKey: input.mealKey },
      };
    },
  });

  const created = await runner.create("sample-skill", {});
  const rejected = await runner.action(created.id, "adjust", {});
  assert.equal(rejected.status, "waiting");
  assert.equal(rejected.checkpoint.id, "approval");
  assert.equal(rejected.error.code, "VALIDATION_ERROR");
  assert.equal(rejected.pendingCommand, null);

  const corrected = await runner.action(created.id, "adjust", { mealKey: "day-1-lunch" });
  assert.equal(corrected.status, "waiting");
  assert.deepEqual(corrected.lastAction, { mealKey: "day-1-lunch" });
});

test("store initialization reconciles an interrupted running command into a retryable failure", async (t) => {
  const directory = await temporaryDirectory(t);
  const firstStore = new FileRunStore(directory);
  await firstStore.save({
    id: "sample-skill-00000000",
    skillId: "sample-skill",
    workflowId: "sample-workflow",
    workflowVersion: 1,
    projectId: "sample-project",
    status: "running",
    step: "approval",
    input: {},
    context: {},
    checkpoint: { id: "approval" },
    result: null,
    lastAction: null,
    error: null,
    pendingCommand: { type: "resume", originStatus: "waiting", checkpointId: "approval", input: { approved: true } },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:01.000Z",
    events: [],
  });

  const recoveredStore = new FileRunStore(directory, {
    now: () => Date.parse("2026-08-04T00:00:00.000Z"),
  });
  await recoveredStore.initialize();
  const recovered = await recoveredStore.get("sample-skill-00000000");
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.error.code, "RUN_INTERRUPTED");
  assert.equal(recovered.events.at(-1).type, "command_interrupted");

  const registry = fakeRegistry({
    async start() { return waitingTransition(); },
    async resume({ run }) {
      assert.equal(run.status, "waiting");
      return { status: "completed", step: "done", result: { recovered: true } };
    },
  });
  const runner = new WorkflowRunner({ registry, store: recoveredStore, client: {} });
  const retried = await runner.retry(recovered.id);
  assert.equal(retried.status, "completed");
  assert.deepEqual(retried.result, { recovered: true });
});

test("a failed running-state save releases the in-memory run lock", async () => {
  let saves = 0;
  const store = {
    async save(run) {
      saves += 1;
      if (saves === 2) throw Object.assign(new Error("disk failure C:\\private\\runs"), { code: "EACCES" });
      return structuredClone(run);
    },
  };
  const runner = new WorkflowRunner({
    registry: fakeRegistry({ async start() { return waitingTransition(); } }),
    store,
    client: {},
    createId: () => "00000000-0000-4000-8000-000000000001",
  });

  await assert.rejects(() => runner.create("sample-skill", {}), { code: "EACCES" });
  const created = await runner.create("sample-skill", {});
  assert.equal(created.status, "waiting");
});

test("a failed final-state save preserves the command for retry", async () => {
  let saves = 0;
  let persisted;
  let attempts = 0;
  const store = {
    async get() { return structuredClone(persisted); },
    async save(run) {
      saves += 1;
      if (saves === 3) throw Object.assign(new Error("temporary disk failure"), { code: "EIO" });
      persisted = structuredClone(run);
      return run;
    },
  };
  const runner = new WorkflowRunner({
    registry: fakeRegistry({
      async start() {
        attempts += 1;
        return { status: "completed", step: "done", result: { attempts } };
      },
    }),
    store,
    client: {},
    createId: () => "00000000-0000-4000-8000-000000000001",
  });

  const failed = await runner.create("sample-skill", {});
  assert.equal(failed.status, "failed");
  assert.equal(failed.pendingCommand.type, "start");
  assert.equal(failed.result, null);

  const retried = await runner.retry(failed.id);
  assert.equal(retried.status, "completed");
  assert.deepEqual(retried.result, { attempts: 2 });
});

test("plain adapter validation errors keep a safe actionable code", async (t) => {
  const { runner } = await harness(t, {
    async start() { throw validationError("private adapter validation detail"); },
  });

  const failed = await runner.create("sample-skill", {});
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.error, {
    code: "VALIDATION_ERROR",
    message: "输入不符合当前步骤要求，请检查后重新提交。",
  });
  assert.equal(failed.pendingCommand.type, "start");
});

test("runs persist their workflow version and reject incompatible continuation", async (t) => {
  let version = 1;
  const directory = await temporaryDirectory(t);
  const store = new FileRunStore(directory);
  const adapter = {
    async start() { return waitingTransition(); },
    async resume() { return { status: "completed", step: "done" }; },
  };
  const registry = {
    get() {
      return { id: "sample-skill", projectId: "sample-project", workflow: { id: "sample-workflow", version } };
    },
    async adapter() { return adapter; },
  };
  const runner = new WorkflowRunner({
    registry,
    store,
    client: {},
    createId: () => "00000000-0000-4000-8000-000000000001",
  });

  const created = await runner.create("sample-skill", {});
  assert.equal(created.workflowVersion, 1);
  version = 2;
  await assert.rejects(
    () => runner.resume(created.id, { approved: true }),
    { code: "RUN_WORKFLOW_INCOMPATIBLE", status: 409 },
  );
});

test("public errors never expose native filesystem paths or error codes", () => {
  const payload = publicError(Object.assign(
    new Error("EACCES: permission denied, open 'C:\\private\\workflow.json'"),
    { code: "EACCES", path: "C:\\private\\workflow.json" },
  ));
  assert.deepEqual(payload, {
    code: "INTERNAL_ERROR",
    message: "工作流执行失败，请稍后重试。",
  });
});

test("runner deletion rejects unknown and actively executing runs", async (t) => {
  let releaseAction;
  let markActionStarted;
  const actionStarted = new Promise((resolve) => { markActionStarted = resolve; });
  const actionReleased = new Promise((resolve) => { releaseAction = resolve; });
  const { runner } = await harness(t, {
    async start() { return waitingTransition(); },
    async action() {
      markActionStarted();
      await actionReleased;
      return waitingTransition();
    },
  });

  await assert.rejects(
    () => runner.delete("unknown-run-00000001"),
    { code: "RUN_NOT_FOUND", status: 404 },
  );

  const created = await runner.create("sample-skill", {});
  const activeAction = runner.action(created.id, "adjust", {});
  await actionStarted;
  await assert.rejects(() => runner.delete(created.id), { code: "RUN_BUSY", status: 409 });
  releaseAction();
  await activeAction;

  assert.equal(await runner.delete(created.id), true);
  await assert.rejects(() => runner.get(created.id), { code: "RUN_NOT_FOUND", status: 404 });
});

test("run locking starts before state loading so deletion cannot race with resume", async (t) => {
  let releaseAdapter;
  let markAdapterRequested;
  const adapterRequested = new Promise((resolve) => { markAdapterRequested = resolve; });
  const adapterReleased = new Promise((resolve) => { releaseAdapter = resolve; });
  const { runner } = await harness(t, {
    async start() { return waitingTransition(); },
    async resume() { return waitingTransition(); },
  });
  const created = await runner.create("sample-skill", {});
  const loadAdapter = runner.registry.adapter.bind(runner.registry);
  runner.registry.adapter = async (id) => {
    markAdapterRequested();
    await adapterReleased;
    return loadAdapter(id);
  };

  const resumed = runner.resume(created.id, { approved: true });
  await adapterRequested;
  try {
    await assert.rejects(() => runner.delete(created.id), { code: "RUN_BUSY", status: 409 });
  } finally {
    releaseAdapter();
  }
  await resumed;
  assert.equal((await runner.get(created.id)).status, "waiting");
});

async function harness(t, adapter) {
  const directory = await temporaryDirectory(t);
  const store = new FileRunStore(directory);
  const runner = new WorkflowRunner({
    registry: fakeRegistry(adapter),
    store,
    client: {},
    now: monotonicClock(),
    createId: () => "00000000-0000-4000-8000-000000000001",
  });
  return { directory, store, runner };
}

function fakeRegistry(adapter) {
  const skill = {
    id: "sample-skill",
    projectId: "sample-project",
    workflow: { id: "sample-workflow", version: 1 },
  };
  return {
    get(id) {
      assert.equal(id, skill.id);
      return skill;
    },
    async adapter(id) {
      assert.equal(id, skill.id);
      return adapter;
    },
  };
}

function waitingTransition() {
  return {
    status: "waiting",
    step: "approval",
    checkpoint: { id: "approval", title: "Approve" },
    context: {},
  };
}

function validationError(message) {
  return Object.assign(new Error(message), { code: "VALIDATION_ERROR", status: 422 });
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "aihub-workflow-recovery-"));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  return directory;
}

function monotonicClock() {
  let tick = 0;
  return () => `2026-08-03T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}
