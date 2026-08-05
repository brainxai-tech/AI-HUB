import assert from "node:assert/strict";
import test from "node:test";

import { tarotDeck } from "../data/tarot-deck.ts";
import { interpretReading } from "../lib/interpretation-engine.ts";
import type { GeneratedReading } from "../lib/types.ts";

function makeReading(cardIds: string[], orientations: Array<"upright" | "reversed">): GeneratedReading {
  return {
    id: "reading-test",
    createdAt: "2026-06-05T00:00:00.000Z",
    theme: "relationship",
    question: "我需要理解什么？",
    cards: cardIds.map((id, index) => {
      const card = tarotDeck.find((deckCard) => deckCard.id === id)!;

      return {
        ...card,
        card,
        orientation: orientations[index],
        position: ["root", "present", "trend"][index] as GeneratedReading["cards"][number]["position"],
      };
    }),
  };
}

test("interpretReading returns required sections and action advice for relationship theme", () => {
  const reading = makeReading(["the-lovers", "two-of-cups", "the-moon"], [
    "reversed",
    "upright",
    "upright",
  ]);

  const interpretation = interpretReading(reading);

  assert.equal(interpretation.cardSections.length, 3);
  assert.ok(interpretation.verdict.answer === "supportive" || interpretation.verdict.answer === "blocked");
  assert.ok(["high", "medium", "low"].includes(interpretation.verdict.confidence));
  assert.ok(interpretation.verdict.why.includes("因为"));
  assert.ok(interpretation.verdict.whatToDo.length >= 3);
  assert.equal(interpretation.verdict.scoreBreakdown.length, 3);
  assert.ok(interpretation.verdict.scoreBreakdown.every((factor) => typeof factor.contribution === "number"));
  for (const drawnCard of reading.cards) {
    assert.ok(interpretation.verdict.why.includes(drawnCard.card.name));
  }
  assert.ok(interpretation.summary.includes("关系"));
  assert.ok(interpretation.combination);
  assert.ok(interpretation.riskNotes.length > 0);
  assert.ok(interpretation.actions.nextAction);
  assert.ok(interpretation.actions.avoid);
  assert.ok(interpretation.actions.sevenDayObservation);
  assert.ok(interpretation.disclaimer.includes("反思"));
  assert.ok(interpretation.disclaimer.includes("娱乐"));
});

test("interpretReading supports career theme and reacts to many reversed cards", () => {
  const reading = makeReading(["ace-of-pentacles", "eight-of-pentacles", "the-tower"], [
    "reversed",
    "reversed",
    "reversed",
  ]);
  reading.theme = "career";

  const interpretation = interpretReading(reading);

  assert.ok(interpretation.summary.includes("事业与财富"));
  assert.equal(interpretation.verdict.answer, "blocked");
  assert.match(interpretation.combination, /阻滞|延迟|动机不清/);
});

test("interpretReading combination reacts to major arcana count", () => {
  const reading = makeReading(["the-fool", "the-lovers", "the-world"], [
    "upright",
    "upright",
    "upright",
  ]);

  const interpretation = interpretReading(reading);

  assert.equal(interpretation.verdict.answer, "supportive");
  assert.match(interpretation.combination, /课题|门槛|阶段性转折/);
});

test("interpretReading identifies question intent and judgment path", () => {
  const reading = makeReading(["the-lovers", "two-of-cups", "the-star"], [
    "upright",
    "upright",
    "upright",
  ]);
  reading.question = "我们还能不能复合？";

  const interpretation = interpretReading(reading);

  assert.equal(interpretation.intent.id, "relationship-reunion");
  assert.equal(interpretation.intent.label, "复合 / 重新靠近");
  assert.match(interpretation.intent.judgmentPath, /复合|重新靠近/);
  assert.deepEqual(interpretation.intent.matchedKeywords, ["复合"]);
});

test("interpretReading exposes support signals, resistance signals, and a change condition", () => {
  const reading = makeReading(["the-sun", "the-devil", "the-tower"], [
    "upright",
    "reversed",
    "reversed",
  ]);

  const interpretation = interpretReading(reading);

  assert.ok(interpretation.verdict.supportSignals.length >= 1);
  assert.ok(interpretation.verdict.resistanceSignals.length >= 1);
  assert.ok(interpretation.verdict.supportSignals.some((signal) => signal.cardName === "太阳"));
  assert.ok(interpretation.verdict.resistanceSignals.some((signal) => signal.cardName === "高塔"));
  assert.match(interpretation.verdict.changeCondition, /重新判断|改判|条件/);
});
