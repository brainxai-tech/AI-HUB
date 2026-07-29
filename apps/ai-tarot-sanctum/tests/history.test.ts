import assert from "node:assert/strict";
import test from "node:test";

import { tarotDeck } from "../data/tarot-deck.ts";
import { parseSavedReadings, serializeSavedReadings } from "../lib/history.ts";
import type { SavedReading } from "../lib/types.ts";

function validReading(): SavedReading {
  return {
    id: "saved-1",
    createdAt: "2026-06-05T00:00:00.000Z",
    theme: "relationship",
    question: "What is worth noticing?",
    cards: [
      { ...tarotDeck[0], card: tarotDeck[0], orientation: "upright", position: "root" },
      { ...tarotDeck[1], card: tarotDeck[1], orientation: "reversed", position: "present" },
      { ...tarotDeck[2], card: tarotDeck[2], orientation: "upright", position: "trend" },
    ],
    summary: "A reflective summary.",
    actions: {
      nextAction: "Name the question plainly.",
      avoid: "Avoid forcing certainty.",
      sevenDayObservation: "Notice repeated signals.",
    },
    savedAt: "2026-06-05T00:01:00.000Z",
  };
}

test("parseSavedReadings ignores malformed records and preserves valid records", () => {
  const raw = JSON.stringify([
    validReading(),
    null,
    { id: "bad" },
    { ...validReading(), id: 12 },
    { ...validReading(), theme: "health" },
  ]);

  const parsed = parseSavedReadings(raw);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "saved-1");
});

test("parseSavedReadings handles invalid JSON and non-array values defensively", () => {
  assert.deepEqual(parseSavedReadings("{bad json"), []);
  assert.deepEqual(parseSavedReadings(JSON.stringify({ id: "not-array" })), []);
  assert.deepEqual(parseSavedReadings(null), []);
});

test("parseSavedReadings migrates legacy combined and actionAdvice records", () => {
  const legacy: Record<string, unknown> = { ...validReading() };
  delete legacy.summary;
  delete legacy.actions;
  delete legacy.savedAt;
  const parsed = parseSavedReadings(JSON.stringify([
    {
      ...legacy,
      combined: "Legacy combined interpretation.",
      actionAdvice: ["Write down facts.", "Do not rush.", "Review in seven days."],
    },
  ]));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].summary, "Legacy combined interpretation.");
  assert.equal(parsed[0].actions.nextAction, "Write down facts.");
  assert.ok(parsed[0].savedAt);
});

test("serializeSavedReadings writes only valid records", () => {
  const valid = validReading();
  const serialized = serializeSavedReadings([valid, { id: "bad" }]);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, valid.id);
});

test("parseSavedReadings preserves local review tags and real-world feedback", () => {
  const reviewed: SavedReading = {
    ...validReading(),
    intent: {
      id: "relationship-reunion",
      label: "复合 / 重新靠近",
      judgmentPath: "判断双方是否具备重新靠近的现实条件。",
      matchedKeywords: ["复合"],
    },
    review: {
      tags: ["复合", "沟通"],
      feedback: "happened",
      note: "对方在三天后主动联系。",
      updatedAt: "2026-06-06T00:00:00.000Z",
    },
  };

  const parsed = parseSavedReadings(JSON.stringify([reviewed]));

  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].review?.tags, ["复合", "沟通"]);
  assert.equal(parsed[0].review?.feedback, "happened");
  assert.equal(parsed[0].review?.note, "对方在三天后主动联系。");
  assert.equal(parsed[0].intent?.id, "relationship-reunion");
});
