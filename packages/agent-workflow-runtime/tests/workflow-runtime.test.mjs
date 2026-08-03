import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FileRunStore } from "../src/run-store.mjs";
import { ProjectClient } from "../src/project-client.mjs";
import { SkillRegistry } from "../src/skill-registry.mjs";
import { WorkflowRunner } from "../src/workflow-runner.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const skillsRoot = path.join(repositoryRoot, "skills");

test("registry loads the four staged AI HUB skills", async () => {
  const registry = await new SkillRegistry(skillsRoot).load();
  assert.deepEqual(
    registry.list().map(({ id }) => id),
    ["build-course-pack", "coach-chinese-essay", "plan-weekly-meals", "read-research-paper"],
  );
  for (const skill of registry.list()) {
    assert.equal(skill.workflow.version, 1);
    assert.ok(skill.projectId.startsWith("ai-"));
  }
});

test("project client preserves project base paths and resolves only configured GPT models", async () => {
  const requests = [];
  const client = new ProjectClient({
    services: { essay: "http://127.0.0.1:4204/essay/", paper: "http://127.0.0.1:4195/paper/" },
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({
        providers: [{ id: "openai", enabled: true, configured: true, defaultModel: "gpt-test", enabledModels: ["gpt-test"] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await client.requestJson("essay", "/api/providers");
  assert.equal(requests[0], "http://127.0.0.1:4204/essay/api/providers");
  assert.equal(await client.resolveModel("paper"), "gpt-test");
  assert.equal(requests[1], "http://127.0.0.1:4195/paper/api/providers");
});

test("essay workflow persists two checkpoints and completes the selected outline", async (t) => {
  const harness = await createHarness(t);
  const created = await harness.runner.create("coach-chinese-essay", {
    essay: {
      prompt: "请以一次真实的失败经历为材料，写出反思和成长。",
      grade: "初三",
      genre: "记叙文",
      targetLength: 800,
      includePunctuation: true,
      scene: "日常练习",
    },
  });
  assert.equal(created.status, "waiting");
  assert.equal(created.checkpoint.id, "collect-materials");

  const outlined = await harness.runner.resume(created.id, {
    materials: { experience: "比赛失利", detail: "最后一题看错条件", insight: "检查比速度重要" },
  });
  assert.equal(outlined.checkpoint.id, "select-outline");
  assert.equal(outlined.checkpoint.options.length, 3);

  const completed = await harness.runner.resume(created.id, { outlineId: "outline-2" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.selectedOutline.id, "outline-2");
  assert.equal(completed.result.essay.data.title, "失败以后");
  await assertPersisted(harness.directory, completed.id, "completed");
});

test("meal workflow preserves its plan, records adjustments, citations, and review", async (t) => {
  const harness = await createHarness(t);
  const created = await harness.runner.create("plan-weekly-meals", {
    profile: { days: 3, familySize: 2, targetCalories: 1600 },
  });
  assert.equal(created.status, "waiting");
  assert.equal(created.context.ragCitations[0].name, "豆腐");

  const adjusted = await harness.runner.action(created.id, "adjust-meal", {
    mealKey: "day0-meal0",
    reason: "没有鸡胸肉",
    constraints: "只有豆腐",
  });
  assert.equal(adjusted.status, "waiting");
  assert.equal(adjusted.context.adjustments.length, 1);
  assert.equal(adjusted.lastAction.response.adjustment.replacementName, "豆腐饭");

  const completed = await harness.runner.resume(created.id, {
    executionState: { meals: { "day0-meal0": "cooked" } },
    feedback: "希望更多变化",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.review.review.summary, "执行稳定");
});

test("paper workflow retrieves paragraph citations for every evidence task", async (t) => {
  const harness = await createHarness(t);
  const created = await harness.runner.create("read-research-paper", {
    source: { kind: "text", value: "A".repeat(120) },
    userLevel: "graduate",
    outputLanguage: "zh-CN",
  });
  assert.equal(created.status, "waiting");
  assert.equal(created.checkpoint.id, "paper-task");

  const answered = await harness.runner.resume(created.id, {
    task: "qa",
    question: "这个方法如何降低误差？",
  });
  assert.equal(answered.status, "waiting");
  assert.equal(answered.context.sessions.length, 1);
  assert.ok(answered.context.sessions[0].citations.some(({ citation }) => citation === "[方法-1]"));

  const completed = await harness.runner.resume(created.id, { finish: true });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.sessions.length, 1);
});

test("course workflow runs deterministic checks, supports revision, and requires approval", async (t) => {
  const harness = await createHarness(t);
  const created = await harness.runner.create("build-course-pack", {
    request: { topic: "供需关系", audience: "高中生", durationMinutes: 45, quizCount: 3 },
    knowledgeSources: [{ sourceId: "econ-1", title: "课程资料", excerpt: "价格变化会影响供给量和需求量。" }],
  });
  assert.equal(created.status, "waiting");
  assert.equal(created.context.checks.ok, true);
  assert.deepEqual(created.checkpoint.citations, [{ sourceId: "econ-1", title: "课程资料" }]);

  const revised = await harness.runner.resume(created.id, { approved: false, revisionNotes: "增加一个反例" });
  assert.equal(revised.status, "waiting");
  assert.equal(revised.context.revisions.length, 2);

  const completed = await harness.runner.resume(created.id, { approved: true });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.checks.ok, true);
});

test("failed upstream steps retain a retry command without leaking request bodies into events", async (t) => {
  let failures = 1;
  const client = fakeClient({
    beforeRequest(service, requestPath) {
      if (service === "essay" && requestPath === "/api/analyze" && failures-- > 0) throw new Error("temporary");
    },
  });
  const harness = await createHarness(t, client);
  const failed = await harness.runner.create("coach-chinese-essay", {
    essay: {
      prompt: "这是足够长的作文练习题目，需要完成一次完整的审题。",
      grade: "初三",
      genre: "记叙文",
      targetLength: 800,
      includePunctuation: true,
      scene: "日常练习",
    },
  });
  assert.equal(failed.status, "failed");
  assert.equal(JSON.stringify(failed.events).includes("作文练习题目"), false);
  const retried = await harness.runner.retry(failed.id);
  assert.equal(retried.status, "waiting");
  assert.equal(retried.pendingCommand, null);
});

async function createHarness(t, client = fakeClient()) {
  const directory = await mkdtemp(path.join(tmpdir(), "aihub-workflow-test-"));
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
    createId: (() => { let id = 0; return () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`; })(),
  });
  return { directory, registry, store, runner };
}

function fakeClient({ beforeRequest = () => {} } = {}) {
  return {
    async resolveModel() { return "gpt-test"; },
    async requestJson(service, requestPath, options = {}) {
      beforeRequest(service, requestPath, options);
      if (service === "essay" && requestPath === "/api/analyze") {
        return { data: { theme: "成长", task: "叙事", requirements: [], avoid: [], angles: [], questions: ["发生了什么？"] } };
      }
      if (service === "essay" && requestPath === "/api/outlines") {
        return { data: { outlines: [1, 2, 3].map((number) => ({
          id: `outline-${number}`,
          style: ["稳妥型", "个性型", "提分型"][number - 1],
          title: `提纲 ${number}`,
          thesis: "失败带来检查习惯",
          highlight: "真实细节",
          sections: [],
        })) } };
      }
      if (service === "essay" && requestPath === "/api/compose") {
        return { data: { title: "失败以后", essay: "正文", feedback: { totalScore: 42 } } };
      }
      if (service === "cooking" && requestPath === "/api/plan") {
        return { mode: "live", plan: { title: "三日计划", shoppingList: [{ items: [{ name: "豆腐", rag: { name: "豆腐", source: "nutrition" } }] }], days: [] } };
      }
      if (service === "cooking" && requestPath === "/api/adjust-meal") {
        return { adjustment: { mealKey: options.body.mealKey, replacementName: "豆腐饭" } };
      }
      if (service === "cooking" && requestPath === "/api/review-week") {
        return { review: { summary: "执行稳定", wins: [], frictions: [], nextWeekAdjustments: [], promptHints: [] } };
      }
      if (service === "paper" && requestPath === "/api/parse-text") {
        return { paper: parsedPaperFixture() };
      }
      if (service === "paper" && requestPath === "/api/import-link") {
        return { paper: parsedPaperFixture() };
      }
      if (service === "paper" && requestPath === "/api/generate") {
        return { data: { title: options.body.task, summary: "grounded", blocks: [], cards: [], questions: [], interviewQuestions: [], notesMarkdown: "", uncertainty: [] }, meta: { model: "gpt-test" } };
      }
      if (service === "course" && requestPath === "/api/teaching-bundles") {
        return { source: "ai", bundle: teachingBundleFixture(options.body.quizCount) };
      }
      throw new Error(`Unhandled fake request: ${service} ${requestPath}`);
    },
  };
}

function parsedPaperFixture() {
  return {
    meta: { title: "误差控制研究", authors: [], importedAt: "2026-08-03T00:00:00.000Z" },
    rawText: "研究使用重复测量降低误差。",
    sections: [
      {
        id: "methods",
        title: "方法",
        role: "method",
        summary: "重复测量与校准",
        paragraphs: [
          { id: "p1", sectionId: "methods", sectionTitle: "方法", index: 1, text: "通过重复测量和仪器校准降低误差。", summary: "误差控制", citation: "[方法-1]" },
        ],
      },
      {
        id: "results",
        title: "结果",
        role: "results",
        summary: "误差下降",
        paragraphs: [
          { id: "p2", sectionId: "results", sectionTitle: "结果", index: 2, text: "实验组的平均误差下降。", summary: "结果", citation: "[结果-1]" },
        ],
      },
    ],
    stats: { characters: 100, words: 20, sections: 2, paragraphs: 2 },
  };
}

function teachingBundleFixture(quizCount = 3) {
  const quiz = Array.from({ length: quizCount }, (_, index) => ({
    id: `q${index + 1}`,
    answer: "A",
    explanation: "解析",
  }));
  return {
    sections: {
      lecture: { title: "供需关系", objective: "解释供需变化" },
      quiz,
      mistakeAnalysis: quiz.map(({ id }) => ({ questionId: id, commonMistake: "混淆" })),
      activities: [{ id: "a1", title: "价格模拟" }],
    },
  };
}

function monotonicClock() {
  let tick = 0;
  return () => `2026-08-03T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}

async function assertPersisted(directory, id, status) {
  const persisted = JSON.parse(await readFile(path.join(directory, `${id}.json`), "utf8"));
  assert.equal(persisted.status, status);
}
