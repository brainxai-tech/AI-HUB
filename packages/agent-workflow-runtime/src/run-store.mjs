import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { WorkflowError } from "./errors.mjs";

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,80}$/i;

export class FileRunStore {
  constructor(directory) {
    if (!directory) throw new TypeError("Run store directory is required.");
    this.directory = path.resolve(directory);
    this.initializationPromise = null;
  }

  async initialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.#initialize().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }
    return this.initializationPromise;
  }

  async get(id) {
    assertRunId(id);
    await this.initialize();
    try {
      return JSON.parse(await readFile(this.#pathFor(id), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new WorkflowError("RUN_NOT_FOUND", "没有找到这次工作流运行。", 404);
      }
      throw error;
    }
  }

  async save(run) {
    assertRunId(run?.id);
    await this.initialize();
    await this.#write(run);
    return run;
  }

  async #initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.#recoverInterruptedRuns();
  }

  async #recoverInterruptedRuns() {
    const entries = await readdir(this.directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -5);
      if (!RUN_ID_PATTERN.test(id)) continue;
      const run = JSON.parse(await readFile(this.#pathFor(id), "utf8"));
      if (run?.id !== id || run.status !== "running") continue;

      const recoveredAt = new Date().toISOString();
      run.status = "failed";
      run.error = {
        code: "RUN_INTERRUPTED",
        message: "工作流执行被服务中断，可以安全重试。",
      };
      run.updatedAt = recoveredAt;
      run.events = Array.isArray(run.events) ? run.events : [];
      run.events.push({
        type: "command_interrupted",
        at: recoveredAt,
        command: run.pendingCommand?.type || "unknown",
        code: "RUN_INTERRUPTED",
      });
      await this.#write(run);
    }
  }

  async #write(run) {
    const target = this.#pathFor(run.id);
    const temporary = path.join(
      this.directory,
      `.${run.id}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  #pathFor(id) {
    return path.join(this.directory, `${id}.json`);
  }
}

function assertRunId(id) {
  if (typeof id !== "string" || !RUN_ID_PATTERN.test(id)) {
    throw new WorkflowError("INVALID_RUN_ID", "工作流运行 ID 无效。", 400);
  }
}
