import assert from "node:assert/strict";
import test from "node:test";

import { adapter } from "../../../skills/read-research-paper/scripts/adapter.mjs";

test("paper QA returns no citations for a zero-overlap query and removes model-invented refs", async () => {
  const paper = gardeningPaper();
  const client = {
    async resolveModel() { return "gpt-test"; },
    async requestJson(_service, path, options) {
      if (path === "/api/parse-text") return { paper };
      if (path === "/api/generate" && options.body.task === "paper_map") {
        return { data: coachData([]) };
      }
      if (path === "/api/generate" && options.body.task === "qa") {
        return { data: coachData([{ heading: "错误证据", body: "回答", evidence: "based_on_text", refs: ["S1-P1"] }]) };
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  };
  const started = await adapter.start({
    input: { source: { kind: "text", value: "A".repeat(100) } },
    client,
  });

  const answered = await adapter.resume({
    run: { context: started.context, checkpoint: started.checkpoint },
    input: { task: "qa", question: "quantum entanglement photon spin" },
    checkpointId: "paper-task",
    client,
    now: () => "2026-08-03T00:00:00.000Z",
  });

  const session = answered.context.sessions[0];
  assert.deepEqual(session.citations, []);
  assert.deepEqual(session.response.data.blocks[0].refs, []);
  assert.equal(session.response.data.blocks[0].evidence, "uncertain");
  assert.match(session.response.data.uncertainty.join("\n"), /没有找到相关论文段落/);
});

test("paper workflow rejects an unknown section before model generation", async () => {
  let generateCalls = 0;
  const client = {
    async resolveModel() { return "gpt-test"; },
    async requestJson(_service, path) {
      if (path === "/api/parse-text") return { paper: gardeningPaper() };
      if (path === "/api/generate") {
        generateCalls += 1;
        return { data: coachData([]) };
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  };
  const started = await adapter.start({
    input: { source: { kind: "text", value: "A".repeat(100) } },
    client,
  });
  await assert.rejects(
    () => adapter.resume({
      run: { context: started.context, checkpoint: started.checkpoint },
      input: { task: "section_explain", sectionId: "missing-section" },
      checkpointId: "paper-task",
      client,
      now: () => "2026-08-03T00:00:00.000Z",
    }),
    /章节不存在/,
  );
  assert.equal(generateCalls, 1);
});

function gardeningPaper() {
  return {
    meta: { title: "Gardening", authors: [] },
    rawText: "Plants and soil ".repeat(10),
    sections: [{
      id: "s1",
      title: "Soil",
      role: "method",
      summary: "soil",
      paragraphs: [
        { id: "p1", sectionId: "s1", sectionTitle: "Soil", index: 1, text: "Tomatoes grow in moist soil.", summary: "tomatoes", citation: "S1-P1" },
        { id: "p2", sectionId: "s1", sectionTitle: "Soil", index: 2, text: "Beans need sunlight.", summary: "beans", citation: "S1-P2" },
      ],
    }],
  };
}

function coachData(blocks) {
  return { title: "result", summary: "summary", blocks, cards: [], questions: [], interviewQuestions: [], notesMarkdown: "", uncertainty: [] };
}
