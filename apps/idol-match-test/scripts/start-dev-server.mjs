import { spawn } from "node:child_process";
import { openSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

await import("./build-idol-profiles.mjs");

const requestedPort = Number(process.argv[2] ?? 3220);
const projectRoot = process.cwd();
const port = await findOpenPort(requestedPort);
const out = openSync(join(projectRoot, "dev-server.out.log"), "w");
const err = openSync(join(projectRoot, "dev-server.err.log"), "w");

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: projectRoot,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true
});

await ensureChildStarted(child);
child.unref();

writeFileSync(join(projectRoot, "dev-server.pid"), String(child.pid), "utf8");
writeFileSync(join(projectRoot, "dev-server.port"), String(port), "utf8");
console.log(`Started dev server on http://localhost:${port} (pid ${child.pid})`);

function ensureChildStarted(childProcess) {
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      childProcess.off("error", onError);
      childProcess.off("exit", onExit);
    };

    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback(value);
    };

    const onError = (error) => {
      finish(reject, error);
    };

    const onExit = (code, signal) => {
      finish(
        reject,
        new Error(`Next dev server exited during startup (code ${code ?? "null"}, signal ${signal ?? "null"}).`)
      );
    };

    childProcess.once("error", onError);
    childProcess.once("exit", onExit);

    timer = setTimeout(() => {
      if (childProcess.exitCode !== null) {
        finish(reject, new Error(`Next dev server exited during startup (code ${childProcess.exitCode}).`));
        return;
      }

      finish(resolve);
    }, 1500);
  });
}

function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (candidate) => {
      const server = createServer();

      server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          tryPort(candidate + 1);
          return;
        }

        reject(error);
      });

      server.once("listening", () => {
        server.close(() => resolve(candidate));
      });

      server.listen(candidate, "127.0.0.1");
    };

    tryPort(startPort);
  });
}
