import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMessage } from "../src/fraudAnalyzer.mjs";

test("flags authority scam with secrecy and transfer request as stop", () => {
  const result = analyzeMessage("这里是公安局，你涉嫌洗钱。马上把钱转入安全账户，不要告诉家人。");

  assert.equal(result.level.key, "stop");
  assert.match(result.summary, /很危险|先别/);
  assert.ok(result.matchedRules.some((rule) => rule.id === "authority"));
  assert.ok(result.matchedRules.some((rule) => rule.id === "secrecy"));
  assert.match(result.childMessage, /先不转账/);
});

test("flags investment group promise as suspicious or stop", () => {
  const result = analyzeMessage("老师带单，内部名额，保证稳赚。下载 APP 入金，收益翻倍，私聊我。");

  assert.ok(["stop", "suspicious"].includes(result.level.key));
  assert.ok(result.matchedRules.some((rule) => rule.id === "investment"));
  assert.ok(result.matchedRules.some((rule) => rule.id === "remote_control"));
});

test("keeps ordinary family message at confirmation level", () => {
  const result = analyzeMessage("晚上一起吃饭吗？我买了菜，你到家前给我打个电话。");

  assert.equal(result.level.key, "check");
  assert.equal(result.matchedRules.length, 0);
  assert.match(result.summary, /没看到特别明显/);
});

test("flags verification code and link requests", () => {
  const result = analyzeMessage("您的订单异常，请点击链接填写银行卡号和验证码，逾期无法赔付。");

  assert.equal(result.level.key, "stop");
  assert.ok(result.matchedRules.some((rule) => rule.id === "private_info"));
  assert.ok(result.actions.some((action) => action.includes("不要点链接")));
});
