import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { openSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const requestedPort = Number(process.argv[2] ?? 3210);
const projectRoot = process.cwd();
const port = await findOpenPort(requestedPort);
const out = openSync(join(projectRoot, "dev-server.out.log"), "a");
const err = openSync(join(projectRoot, "dev-server.err.log"), "a");

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: projectRoot,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true
});

child.unref();

writeFileSync(join(projectRoot, "dev-server.pid"), String(child.pid));
writeFileSync(join(projectRoot, "dev-server.port"), String(port));
console.log(`Started dev server on http://localhost:${port} (pid ${child.pid})`);

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
