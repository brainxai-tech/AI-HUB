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
      workflowVersion: skill.workflow.version,
      projectId: skill.projectId,
      status: "created",
      step: "start",
      input: cloneJson(input ?? {}),
      context: {},
      checkpoint: null,
      result: null,
      lastAction: null,
      error: null,
      pendingCommand: { type: "start", originStatus: "created", input: cloneJson(input ?? {}) },
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [event("created", timestamp, { step: "start" })],
    };
    await this.store.save(run);
    return this.#withRunLock(run.id, () => this.#executeLocked(run, adapter, run.pendingCommand));
  }

  async get(id) {
    return this.store.get(id);
  }

  async delete(id) {
    return this.#withRunLock(id, async () => {
      const deleted = await this.store.delete(id);
      if (!deleted) {
        throw new WorkflowError("RUN_NOT_FOUND", "没有找到这次工作流运行。", 404);
      }
      return true;
    });
  }

  async resume(id, input) {
    return this.#withRunLock(id, async () => {
      const run = await this.store.get(id);
      const adapter = await this.#compatibleAdapter(run);
      if (run.status !== "waiting") {
        throw new WorkflowError("RUN_NOT_WAITING", "当前工作流不在等待输入状态。", 409);
      }
      if (typeof adapter.resume !== "function") {
        throw new WorkflowError("RESUME_NOT_SUPPORTED", "这个 Skill 不支持继续执行。", 409);
      }
      const command = {
        type: "resume",
        originStatus: run.status,
        checkpointId: run.checkpoint?.id,
        input: cloneJson(input ?? {}),
      };
      run.pendingCommand = command;
      return this.#executeLocked(run, adapter, command);
    });
  }

  async action(id, actionId, input) {
    return this.#withRunLock(id, async () => {
      const run = await this.store.get(id);
      const adapter = await this.#compatibleAdapter(run);
      if (!new Set(["waiting", "completed"]).has(run.status)) {
        throw new WorkflowError("ACTION_NOT_AVAILABLE", "当前工作流状态不能执行这个动作。", 409);
      }
      if (typeof adapter.action !== "function") {
        throw new WorkflowError("ACTION_NOT_SUPPORTED", "这个 Skill 没有可调用动作。", 404);
      }
      const command = {
        type: "action",
        originStatus: run.status,
        actionId,
        input: cloneJson(input ?? {}),
      };
      run.pendingCommand = command;
      return this.#executeLocked(run, adapter, command);
    });
  }

  async retry(id) {
    return this.#withRunLock(id, async () => {
      const run = await this.store.get(id);
      const adapter = await this.#compatibleAdapter(run);
      if (run.status !== "failed" || !run.pendingCommand) {
        throw new WorkflowError("RUN_NOT_RETRYABLE", "当前工作流没有可重试的失败步骤。", 409);
      }
      return this.#executeLocked(run, adapter, run.pendingCommand);
    });
  }

  async #compatibleAdapter(run) {
    const skill = this.registry.get(run.skillId);
    if (
      run.workflowId !== skill.workflow.id ||
      run.workflowVersion !== skill.workflow.version
    ) {
      throw new WorkflowError(
        "RUN_WORKFLOW_INCOMPATIBLE",
        "工作流版本已经变化，旧运行不能继续执行，请创建新的运行。",
        409,
        {
          stored: { id: run.workflowId, version: run.workflowVersion ?? null },
          current: { id: skill.workflow.id, version: skill.workflow.version },
        },
      );
    }
    return this.registry.adapter(run.skillId);
  }

  async #withRunLock(id, operation) {
    if (this.lockedRuns.has(id)) {
      throw new WorkflowError("RUN_BUSY", "这次工作流正在执行，请稍后再试。", 409);
    }
    this.lockedRuns.add(id);
    try {
      return await operation();
    } finally {
      this.lockedRuns.delete(id);
    }
  }

  async #executeLocked(run, adapter, command) {
    const adapterRun = cloneJson(run);
    adapterRun.status = command.originStatus || adapterRun.status;
    adapterRun.error = null;

    const startedAt = this.now();
    run.status = "running";
    run.error = null;
    run.updatedAt = startedAt;
    run.events.push(event("command_started", startedAt, commandMetadata(command)));
    try {
      await this.store.save(run);
    } catch (error) {
      restoreRun(run, adapterRun);
      throw error;
    }
    const runningRun = cloneJson(run);

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
      restoreRun(run, runningRun);
      const validation = isValidationError(error);
      const correctable = validation && new Set(["resume", "action"]).has(command.type);
      run.status = correctable ? adapterRun.status : "failed";
      run.error = publicError(validation ? asValidationError(error) : error);
      if (correctable) run.pendingCommand = null;
      run.updatedAt = this.now();
      run.events.push(event(correctable ? "command_rejected" : "command_failed", run.updatedAt, {
        command: command.type,
        step: run.step,
        code: run.error.code,
      }));
      await this.store.save(run);
      return run;
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

function isValidationError(error) {
  return (
    error &&
    typeof error === "object" &&
    error.code === "VALIDATION_ERROR"
  );
}

function asValidationError(error) {
  if (error instanceof WorkflowError) return error;
  return new WorkflowError(
    "VALIDATION_ERROR",
    "输入不符合当前步骤要求，请检查后重新提交。",
    422,
  );
}

function restoreRun(run, snapshot) {
  for (const key of Object.keys(run)) delete run[key];
  Object.assign(run, cloneJson(snapshot));
}
