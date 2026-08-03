import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { WorkflowError } from "./errors.mjs";

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,80}$/i;

export class FileRunStore {
  constructor(directory) {
    if (!directory) throw new TypeError("Run store directory is required.");
    this.directory = path.resolve(directory);
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  async get(id) {
    assertRunId(id);
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
    const target = this.#pathFor(run.id);
    const temporary = path.join(
      this.directory,
      `.${run.id}.${process.pid}.${Date.now()}.tmp`,
    );
    await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, target);
    return run;
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
