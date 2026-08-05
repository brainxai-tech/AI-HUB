import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runWithTransientWindowsRetry } from "./workspace-process-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2eScript = path.join(root, "scripts", "local-suite-e2e.mjs");
const result = runWithTransientWindowsRetry(
  () => spawnSync(process.execPath, [e2eScript], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  }),
  {
    onRetry: () => console.warn("[e2e] hit transient Windows process fast-fail 0xC0000409; retrying once."),
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(`[e2e] failed with exit code ${result.status}`);
  process.exitCode = Number.isInteger(result.status) && result.status > 0 && result.status <= 255
    ? result.status
    : 1;
}
