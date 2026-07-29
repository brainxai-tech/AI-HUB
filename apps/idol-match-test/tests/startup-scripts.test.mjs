import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const startCmd = readFileSync(new URL("../start-idol-match-test.cmd", import.meta.url), "utf8");
const openWhenReady = readFileSync(new URL("../scripts/open-when-ready.ps1", import.meta.url), "utf8");
const startDevServer = readFileSync(new URL("../scripts/start-dev-server.mjs", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

describe("Windows startup scripts", () => {
  it("keeps the command window open when startup fails", () => {
    assert.match(startCmd, /if\s+errorlevel\s+1/i);
    assert.match(startCmd, /pause/i);
  });

  it("fails fast when npm cannot start the detached server", () => {
    assert.match(openWhenReady, /\$LASTEXITCODE\s+-ne\s+0/);
    assert.match(openWhenReady, /exit\s+\$LASTEXITCODE/);
  });

  it("detects a detached dev server that exits immediately", () => {
    assert.match(startDevServer, /await\s+ensureChildStarted/);
    assert.match(startDevServer, /\.exitCode\s+!==\s+null/);
  });

  it("allows the 127.0.0.1 URL opened by the start script", () => {
    assert.match(openWhenReady, /127\.0\.0\.1/);
    assert.match(nextConfig, /allowedDevOrigins/);
    assert.match(nextConfig, /127\.0\.0\.1/);
  });
});
