import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Windows start script opens the browser from the visible server flow", async () => {
  const script = await readFile(new URL("../start-ai-cooking-coach.cmd", import.meta.url), "utf8");
  const serverIndex = script.indexOf("start-local-server.ps1");

  assert.match(script, /start-local-server\.ps1/);
  assert.match(script, /powershell\.exe/i);
  assert.doesNotMatch(script, /npm\.cmd start/);
  assert.doesNotMatch(script, /exit \/b 0/);
  assert.doesNotMatch(script, /open-when-ready\.ps1/);
  assert.doesNotMatch(script, /WindowStyle Hidden/);
  assert.match(script, /pause/);
  assert.ok(serverIndex >= 0, "foreground server starts directly");
});

test("local server starter keeps node in the foreground so the cmd window stays open", async () => {
  const script = await readFile(new URL("../scripts/start-local-server.ps1", import.meta.url), "utf8");

  assert.match(script, /server\.mjs/);
  assert.match(script, /api\/health/);
  assert.match(script, /Repair-PathEnvironment/);
  assert.match(script, /Remove-Item Env:\\PATH/);
  assert.match(script, /while \(\$true\)/);
  assert.match(script, /Open-LocalApp/);
  assert.match(script, /Wait-ForLocalHealth/);
  assert.match(script, /ProcessStartInfo/);
  assert.match(script, /Arguments = "server\.mjs"/);
  assert.match(script, /UseShellExecute = \$false/);
  assert.match(script, /EnvironmentVariables\["PORT"\]/);
  assert.match(script, /WaitForExit/);
  assert.match(script, /Start-Process/);
  assert.match(script, /Open this URL manually/);
  assert.match(script, /dev-server\.pid/);
});

test("browser opener waits for health check and opens the local app URL", async () => {
  const script = await readFile(new URL("../scripts/open-when-ready.ps1", import.meta.url), "utf8");

  assert.match(script, /http:\/\/127\.0\.0\.1:4317\/api\/health/);
  assert.match(script, /http:\/\/127\.0\.0\.1:4317/);
  assert.match(script, /Start-Process/);
});
