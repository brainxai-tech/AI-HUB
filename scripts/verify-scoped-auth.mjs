import { readFile } from "node:fs/promises";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

function parseEnvironment(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const environmentPath = argument("env");
const capability = argument("capability", "model:chat");
const baseUrl = argument("url", "http://127.0.0.1:4194").replace(/\/+$/, "");
const environment = parseEnvironment(await readFile(environmentPath, "utf8"));
if (!environment.HUB_PROJECT_ID || !environment.HUB_PROJECT_TOKEN) {
  throw new Error("The scoped environment file is incomplete.");
}

const endpoint = capability === "coze:invoke" ? "/api/integrations/coze/run" : "/api/chat";
const body = capability === "coze:invoke" ? {} : { messages: [] };
const response = await fetch(`${baseUrl}${endpoint}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-project-id": environment.HUB_PROJECT_ID,
    "x-hub-project-token": environment.HUB_PROJECT_TOKEN,
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(5000),
});
const payload = await response.json().catch(() => ({}));
const expectedCode = capability === "coze:invoke" ? "COZE_INPUT_INVALID" : "INVALID_MESSAGES";
if (response.status !== 400 || payload?.error?.code !== expectedCode) {
  const responseCode = typeof payload?.error?.code === "string" ? payload.error.code : "UNKNOWN";
  throw new Error(
    `Scoped authorization verification failed with HTTP ${response.status} and code ${responseCode}.`,
  );
}
console.log(`Scoped authorization verified: ${environment.HUB_PROJECT_ID} (${capability})`);
