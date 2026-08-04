import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { defaultServices } from "../src/project-client.mjs";
import { FileRunStore } from "../src/run-store.mjs";
import { SkillRegistry } from "../src/skill-registry.mjs";
import { WorkflowRunner } from "../src/workflow-runner.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.resolve(packageRoot, "../../skills");

test("legal workflow preserves immutable evidence versions and requires human review", async (t) => {
  const requests = [];
  const { runner } = await harness(t, legalClient(requests));
  const created = await runner.create("review-legal-clause", {
    clauseText: "乙方违反保密义务时，应赔偿甲方全部损失，且甲方可以立即解除合同。",
    userRole: "乙方",
    contractType: "服务合同",
    jurisdiction: "中国大陆",
    outputLanguage: "zh-CN",
    reviewGoal: "重点检查赔偿与解除",
    reviewerNotes: "初次自动分析，等待证据复核",
  });

  assert.equal(created.status, "waiting");
  assert.equal(created.checkpoint.id, "analysis-review");
  assert.equal(created.context.analysisVersions.length, 1);
  assert.equal(created.context.analysisVersions[0].jurisdiction, "中国大陆");
  assert.equal(created.context.analysisVersions[0].reviewerNotes, "初次自动分析，等待证据复核");
  assert.match(created.context.analysisVersions[0].disclaimer, /法律意见/);
  assert.deepEqual(created.context.analysisVersions[0].evidenceSnippets, ["赔偿甲方全部损失", "甲方可以立即解除合同"]);
  assert.equal(requests[0].serviceId, "legal");
  assert.equal(requests[0].requestPath, "/api/analyze");
  assert.equal(requests[0].body.provider, "openai");
  assert.equal(requests[0].body.jurisdiction, "中国大陆");
  assert.equal("reviewGoal" in requests[0].body, false);

  const firstVersion = structuredClone(created.context.analysisVersions[0]);
  const revised = await runner.action(created.id, "reanalyze", {
    additionalContext: "补充说明：损失范围包括间接损失，解除无需提前通知。",
    reviewerNotes: "补充了赔偿范围和通知条件",
  });
  assert.equal(revised.status, "waiting");
  assert.equal(revised.checkpoint.id, "analysis-review");
  assert.equal(revised.context.analysisVersions.length, 2);
  assert.deepEqual(revised.context.analysisVersions[0], firstVersion);
  assert.equal(revised.context.analysisVersions[1].reviewerNotes, "补充了赔偿范围和通知条件");
  assert.match(requests[1].body.clauseText, /补充合同上下文/);

  for (const version of revised.context.analysisVersions) {
    assert.ok(version.createdAt);
    assert.equal(version.jurisdiction, "中国大陆");
    assert.equal(typeof version.reviewerNotes, "string");
    assert.match(version.disclaimer, /律师/);
    assert.ok(Array.isArray(version.qualityWarnings));
    assert.ok(version.evidenceSnippets.length > 0);
  }

  const prepared = await runner.resume(created.id, {
    decision: "prepare-lawyer-review",
    reviewerNotes: "已逐条核对原文片段，请律师确认间接损失范围。",
  });
  assert.equal(prepared.status, "waiting");
  assert.equal(prepared.checkpoint.id, "legal-review");
  assert.equal(prepared.context.lawyerReviewPacket.modelOnly, true);
  assert.equal(prepared.context.lawyerReviewPacket.analysisVersions.length, 2);
  assert.match(prepared.context.lawyerReviewPacket.boundary, /不构成法律意见/);

  const completed = await runner.resume(created.id, {
    decision: "needs-lawyer",
    reviewerNotes: "赔偿范围重大，必须由中国大陆执业律师确认。",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.step, "needs-lawyer");
  assert.equal(completed.result.decision, "needs-lawyer");
  assert.equal(completed.result.audit.humanReviewRecorded, true);
  assert.equal(JSON.stringify(completed).includes("legal-approved"), false);
});

test("legal workflow rejects a project response without a disclaimer", async (t) => {
  const { runner } = await harness(t, legalClient([], { disclaimer: undefined }));
  const failed = await runner.create("review-legal-clause", {
    clauseText: "本条款用于测试免责声明缺失时必须失败并要求重新检查分析输出。",
    jurisdiction: "中国大陆",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "VALIDATION_ERROR");
  assert.equal(failed.error.message, "输入不符合当前步骤要求，请检查后重新提交。");
  assert.equal(JSON.stringify(failed.events).includes("disclaimer"), false);
});

test("legal workflow rejects oversized clauses instead of silently truncating them", async (t) => {
  const requests = [];
  const { runner } = await harness(t, legalClient(requests));
  const failed = await runner.create("review-legal-clause", {
    clauseText: "合".repeat(20_001),
    jurisdiction: "中国大陆",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "VALIDATION_ERROR");
  assert.equal(requests.length, 0);
});

test("legal service remains on the shared loopback runtime and manifest is model-only", async () => {
  const services = defaultServices({ AIHUB_SHARED_PROJECT_ORIGIN: "http://127.0.0.1:4999" });
  assert.equal(services.legal, "http://127.0.0.1:4999/legal/");

  const manifest = JSON.parse(await readFile(path.join(skillsRoot, "review-legal-clause", "agent-skill.json"), "utf8"));
  assert.deepEqual(manifest.knowledge, {
    mode: "model-only",
    citationRequired: false,
    plannedSources: ["versioned-jurisdiction-guidance"],
  });
});

async function harness(t, client) {
  const directory = await mkdtemp(path.join(tmpdir(), "aihub-legal-workflow-"));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const registry = await new SkillRegistry(skillsRoot).load();
  const store = new FileRunStore(directory);
  const runner = new WorkflowRunner({
    registry,
    store,
    client,
    now: monotonicClock(),
    createId: () => "00000000-0000-4000-8000-000000000101",
  });
  return { runner };
}

function legalClient(requests, overrides = {}) {
  return {
    async resolveModel(serviceId) {
      assert.equal(serviceId, "legal");
      return "gpt-test";
    },
    async requestJson(serviceId, requestPath, options) {
      requests.push({ serviceId, requestPath, body: structuredClone(options.body) });
      return { result: { ...analysisFixture(requests.length), ...overrides } };
    },
  };
}

function analysisFixture(version) {
  return {
    plainLanguage: `这是第 ${version} 版通俗解释。`,
    userObligations: [{ title: "赔偿义务", plainMeaning: "乙方可能承担宽泛赔偿。", evidenceText: "赔偿甲方全部损失" }],
    counterpartyRights: [{ title: "解除权", plainMeaning: "甲方可以立即解除。", evidenceText: "甲方可以立即解除合同" }],
    risks: [{
      title: "赔偿范围过宽",
      level: "HIGH",
      whyItMatters: "可能包含难以预估的损失。",
      originalSignal: "赔偿甲方全部损失",
      evidenceText: "赔偿甲方全部损失",
    }],
    ambiguousTerms: ["全部损失"],
    lawyerQuestions: ["是否排除间接损失？"],
    negotiationSuggestions: ["限定直接损失并设置责任上限。"],
    confidence: "MEDIUM",
    disclaimer: "本结果仅供信息辅助，不构成法律意见；重大事项请咨询合格律师。",
    qualityWarnings: [{ code: "MISSING_EVIDENCE", message: "请逐条核对原文依据。" }],
  };
}

function monotonicClock() {
  let tick = 0;
  return () => `2026-08-04T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}
