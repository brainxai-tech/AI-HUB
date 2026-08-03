import { randomUUID } from "node:crypto";

import { WorkflowError, publicError } from "./errors.mjs";

export class WorkflowRunner {
  constructor({ registry, store, client, now = () => new Date().toISOString(), createId = () => randomUUID() }) {
    this.registry = registry;
    this.store = store;
    this.client = client;
    this.now = now;
    this.createId = createId;
    this.lockedRuns = new Set();
  }

  async create(skillId, input) {
    const skill = this.registry.get(skillId);
    const adapter = await this.registry.adapter(skillId);
    const timestamp = this.now();
    const run = {
      id: `${skillId}-${this.createId()}`.toLowerCase(),
      skillId,
      workflowId: skill.workflow.id,
      projectId: skill.projectId,
      status: "created",
      step: "start",
      input: cloneJson(input ?? {}),
      context: {},
      checkpoint: null,
      result: null,
      lastAction: null,
      error: null,
      pendingCommand: { type: "start", input: cloneJson(input ?? {}) },
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [event("created", timestamp, { step: "start" })],
    };
    await this.store.save(run);
    return this.#execute(run, adapter, run.pendingCommand);
  }

  async get(id) {
    return this.store.get(id);
  }

  async resume(id, input) {
    const run = await this.store.get(id);
    if (run.status !== "waiting") {
      throw new WorkflowError("RUN_NOT_WAITING", "当前工作流不在等待输入状态。", 409);
    }
    const adapter = await this.registry.adapter(run.skillId);
    if (typeof adapter.resume !== "function") {
      throw new WorkflowError("RESUME_NOT_SUPPORTED", "这个 Skill 不支持继续执行。", 409);
    }
    const command = { type: "resume", checkpointId: run.checkpoint?.id, input: cloneJson(input ?? {}) };
    run.pendingCommand = command;
    return this.#execute(run, adapter, command);
  }

  async action(id, actionId, input) {
    const run = await this.store.get(id);
    if (!new Set(["waiting", "completed"]).has(run.status)) {
      throw new WorkflowError("ACTION_NOT_AVAILABLE", "当前工作流状态不能执行这个动作。", 409);
    }
    const adapter = await this.registry.adapter(run.skillId);
    if (typeof adapter.action !== "function") {
      throw new WorkflowError("ACTION_NOT_SUPPORTED", "这个 Skill 没有可调用动作。", 404);
    }
    const command = { type: "action", actionId, input: cloneJson(input ?? {}) };
    run.pendingCommand = command;
    return this.#execute(run, adapter, command);
  }

  async retry(id) {
    const run = await this.store.get(id);
    if (run.status !== "failed" || !run.pendingCommand) {
      throw new WorkflowError("RUN_NOT_RETRYABLE", "当前工作流没有可重试的失败步骤。", 409);
    }
    const adapter = await this.registry.adapter(run.skillId);
    return this.#execute(run, adapter, run.pendingCommand);
  }

  async #execute(run, adapter, command) {
    if (this.lockedRuns.has(run.id)) {
      throw new WorkflowError("RUN_BUSY", "这次工作流正在执行，请稍后再试。", 409);
    }
    this.lockedRuns.add(run.id);
    const adapterRun = cloneJson(run);
    const startedAt = this.now();
    run.status = "running";
    run.error = null;
    run.updatedAt = startedAt;
    run.events.push(event("command_started", startedAt, commandMetadata(command)));
    await this.store.save(run);

    try {
      const method = command.type === "start" ? "start" : command.type;
      const transition = await adapter[method]({
        run: adapterRun,
        input: cloneJson(command.input),
        actionId: command.actionId,
        checkpointId: command.checkpointId,
        client: this.client,
        now: this.now,
      });
      validateTransition(transition);
      applyTransition(run, transition);
      run.pendingCommand = null;
      run.updatedAt = this.now();
      run.events.push(event("command_completed", run.updatedAt, {
        command: command.type,
        step: run.step,
        status: run.status,
      }));
      await this.store.save(run);
      return run;
    } catch (error) {
      run.status = "failed";
      run.error = publicError(error);
      run.updatedAt = this.now();
      run.events.push(event("command_failed", run.updatedAt, {
        command: command.type,
        step: run.step,
        code: run.error.code,
      }));
      await this.store.save(run);
      return run;
    } finally {
      this.lockedRuns.delete(run.id);
    }
  }
}

function validateTransition(transition) {
  if (!transition || typeof transition !== "object") throw new Error("Skill adapter returned no transition.");
  if (!new Set(["waiting", "completed"]).has(transition.status)) {
    throw new Error(`Invalid workflow transition status: ${transition.status}`);
  }
  if (typeof transition.step !== "string" || !transition.step) throw new Error("Workflow transition is missing step.");
  if (transition.status === "waiting" && (!transition.checkpoint || typeof transition.checkpoint.id !== "string")) {
    throw new Error("Waiting transition is missing checkpoint metadata.");
  }
}

function applyTransition(run, transition) {
  run.status = transition.status;
  run.step = transition.step;
  run.context = cloneJson(transition.context ?? run.context);
  run.checkpoint = transition.status === "waiting" ? cloneJson(transition.checkpoint) : null;
  if ("result" in transition) run.result = cloneJson(transition.result);
  if ("actionResult" in transition) run.lastAction = cloneJson(transition.actionResult);
  run.error = null;
}

function event(type, at, details = {}) {
  return { type, at, ...details };
}

function commandMetadata(command) {
  return {
    command: command.type,
    ...(command.actionId ? { actionId: command.actionId } : {}),
    ...(command.checkpointId ? { checkpointId: command.checkpointId } : {}),
  };
}

function cloneJson(value) {
  return value === undefined ? undefined : structuredClone(value);
}
