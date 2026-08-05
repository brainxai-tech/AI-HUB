import assert from "node:assert/strict";
import test from "node:test";

import { adapter } from "../../../skills/build-course-pack/scripts/adapter.mjs";

test("course grounding cites only sources actually injected after long requirements", async () => {
  let requestBody;
  const generation = { source: "ai", bundle: teachingBundle(1) };
  const client = {
    async resolveModel() { return "gpt-test"; },
    async requestJson(_service, _path, options) {
      requestBody = options.body;
      return generation;
    },
  };
  const knowledgeSources = Array.from({ length: 12 }, (_, index) => ({
    sourceId: index < 2 ? `${"shared-prefix-".repeat(4)}${index + 1}` : `source-${index + 1}-${"x".repeat(40)}`,
    title: `授权资料 ${index + 1} ${"长标题".repeat(20)}`,
    excerpt: `资料 ${index + 1} 的事实内容。`.repeat(120),
  }));

  const transition = await adapter.start({
    input: {
      request: {
        topic: "供需关系",
        audience: "高中生",
        quizCount: 5,
        extraRequirements: "用户附加要求。".repeat(240),
      },
      knowledgeSources,
    },
    client,
    now: () => "2026-08-03T00:00:00.000Z",
  });

  assert.ok(transition.checkpoint.citations.length > 0);
  assert.ok(transition.checkpoint.citations.length < knowledgeSources.length);
  assert.equal(
    new Set(transition.checkpoint.citations.map(({ sourceId }) => sourceId)).size,
    transition.checkpoint.citations.length,
  );
  assert.ok(requestBody.extraRequirements.indexOf("\n仅把下列资料") > 700);
  for (const citation of transition.checkpoint.citations) {
    assert.match(requestBody.extraRequirements, new RegExp(`\\[${citation.sourceId}\\]`));
  }
  const citedIds = new Set(transition.checkpoint.citations.map(({ sourceId }) => sourceId));
  for (const source of knowledgeSources.filter(({ sourceId }) => !citedIds.has(sourceId))) {
    assert.doesNotMatch(requestBody.extraRequirements, new RegExp(`\\[${source.sourceId}\\]`));
  }
  assert.equal(transition.checkpoint.checks.ok, false);
  assert.match(transition.checkpoint.checks.warnings.join("\n"), /需要 5 题，实际 1 题/);

  const revisionNotes = "修正说明".repeat(150);
  const revised = await adapter.resume({
    run: { context: transition.context },
    input: { approved: false, revisionNotes },
    checkpointId: "teacher-review",
    client,
    now: () => "2026-08-03T00:00:01.000Z",
  });
  assert.match(requestBody.extraRequirements, new RegExp(`教师复核修改：${revisionNotes}`));

  const approved = await adapter.resume({
    run: { context: revised.context },
    input: { approved: true },
    checkpointId: "teacher-review",
    client,
    now: () => "2026-08-03T00:00:02.000Z",
  });
  assert.equal(approved.result.bundle, generation.bundle);
  assert.ok(approved.result.bundle.sections);
  assert.equal(approved.result.bundle.bundle, undefined);
});

function teachingBundle(quizCount) {
  const quiz = Array.from({ length: quizCount }, (_, index) => ({
    id: `q${index + 1}`,
    answer: "A",
    explanation: "解析",
  }));
  return {
    sections: {
      lecture: { title: "供需关系", objective: "解释价格与数量变化" },
      quiz,
      mistakeAnalysis: quiz.map(({ id }) => ({ questionId: id, commonMistake: "混淆变量" })),
      activities: [{ id: "a1", title: "价格模拟" }],
    },
  };
}
