import assert from "node:assert/strict";
import http from "node:http";

const hubServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/hub/api/model-config") {
    sendJson(res, 200, {
      defaultProvider: "deepseek",
      adminAuthConfigured: true,
      projectAuthRequired: true,
      endpoints: {
        chat: "/hub/api/chat",
        openAiCompatible: "/hub/api/v1/chat/completions"
      },
      providers: [
        {
          id: "openai",
          label: "GPT",
          adapter: "openai-compatible",
          model: "gpt-5.5",
          models: ["gpt-5.5", "gpt-5-mini"],
          enabledModels: ["gpt-5.5"],
          enabled: false,
          configured: false
        },
        {
          id: "deepseek",
          label: "DeepSeek",
          adapter: "openai-compatible",
          model: "deepseek-v4-flash",
          models: ["deepseek-v4-flash", "deepseek-v4-pro"],
          enabledModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
          enabled: true,
          configured: true
        }
      ]
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/hub/api/v1/chat/completions") {
    await readBody(req);
    sendJson(res, 200, {
      choices: [
        {
          message: {
            role: "assistant",
            content: "hello from hub"
          }
        }
      ]
    });
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

await listen(hubServer);
const hubPort = hubServer.address().port;
process.env.HUB_MODEL_CONFIG_URL = `http://127.0.0.1:${hubPort}/hub/api/model-config`;
process.env.HUB_CHAT_COMPLETIONS_URL = `http://127.0.0.1:${hubPort}/hub/api/v1/chat/completions`;
process.env.HUB_PROJECT_TOKEN = "test-project-token";

const { createAppServer } = await import("../server.mjs");
const appServer = createAppServer();
await listen(appServer);
const baseUrl = `http://127.0.0.1:${appServer.address().port}`;

try {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    app: "ai-emotional-companion-local"
  });

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(await page.text(), /apiKeyInput/);

  const appScript = await fetch(`${baseUrl}/app.js`);
  assert.equal(appScript.status, 200);
  assert.doesNotMatch(await appScript.text(), /apiKeyInput/);

  const providers = await fetch(`${baseUrl}/api/providers`);
  assert.equal(providers.status, 200);
  const providersBody = await providers.json();
  assert.equal(providersBody.configured, true);
  assert.equal(providersBody.defaultProvider, "deepseek");
  assert.equal(providersBody.hubUrl, "/hub/#models");
  assert.equal(providersBody.providers.some((provider) => provider.provider === "deepseek" && provider.configured), true);
  assert.equal(providersBody.providers.some((provider) => provider.provider === "openai" && !provider.configured), true);

  const session = await fetch(`${baseUrl}/api/key/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie");
  const sessionBody = await session.json();
  assert.equal(sessionBody.providerId, "deepseek");
  assert.equal(sessionBody.model, "deepseek-v4-flash");
  assert.match(cookie ?? "", /companion_session=/);

  const status = await fetch(`${baseUrl}/api/key/status`, {
    headers: { Cookie: cookie?.split(";")[0] ?? "" }
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).connected, true);

  const chat = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie?.split(";")[0] ?? ""
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "hi" }]
    })
  });
  assert.equal(chat.status, 200);
  assert.match(await chat.text(), /hello from hub/);

  console.log("hub contract ok");
} finally {
  await close(appServer);
  await close(hubServer);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
