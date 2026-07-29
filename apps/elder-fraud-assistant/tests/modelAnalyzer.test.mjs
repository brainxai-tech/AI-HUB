import test from "node:test";
import assert from "node:assert/strict";
import {
  callModelProvider,
  normalizeModelResult,
  parseModelJson
} from "../src/modelAnalyzer.mjs";

const modelJson = JSON.stringify({
  level: { key: "stop", score: 93 },
  summary: "这个很危险，先别操作。",
  matchedRules: [
    {
      id: "remote_control",
      label: "要求下载软件",
      plain: "对方让你装陌生软件。",
      advice: "不要下载。",
      evidence: ["下载 APP"]
    }
  ],
  actions: ["先不要转账。", "发给子女确认。"],
  childMessage: "我收到下面这段消息，想让你帮我确认一下是不是诈骗。我现在先不转账、不点链接、不下载软件，也不把验证码告诉别人。",
  childReply: "先别操作，把完整截图发我。"
});

function makeFetch(responseBody, inspect) {
  return async (url, options) => {
    inspect?.(url, options);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseBody)
    };
  };
}

const baseRequest = {
  message: "请下载 APP 共享屏幕",
  localResult: { level: { key: "stop" } }
};

test("parses JSON even when model wraps it in text", () => {
  const parsed = parseModelJson(`结果如下：\n${modelJson}\n谢谢`);
  assert.equal(parsed.level.key, "stop");
});

test("normalizes model result to app contract", () => {
  const result = normalizeModelResult(JSON.parse(modelJson));

  assert.equal(result.level.key, "stop");
  assert.equal(result.level.label, "先别动");
  assert.equal(result.matchedRules[0].label, "要求下载软件");
  assert.match(result.childMessage, /先不转账/);
});

test("calls the scoped AI Hub chat endpoint without a user API key", async () => {
  const result = await callModelProvider({
    ...baseRequest,
    fetchImpl: makeFetch({ choices: [{ message: { content: modelJson } }] }, (url, options) => {
      assert.equal(url, "http://127.0.0.1:4194/hub/api/v1/chat/completions");
      assert.equal("Authorization" in options.headers, false);
      const body = JSON.parse(options.body);
      assert.equal(body.messages[0].role, "system");
      assert.deepEqual(body.response_format, { type: "json_object" });
    })
  });

  assert.equal(result.level.key, "stop");
});
