import assert from "node:assert/strict";
import test from "node:test";

import { tarotDeck } from "../data/tarot-deck.ts";
import { drawThreeCardReading } from "../lib/reading-engine.ts";

test("drawThreeCardReading draws exactly three unique cards in spread order", () => {
  const values = [0, 0, 0, 0, 0, 0];
  const reading = drawThreeCardReading({
    theme: "relationship",
    question: "What pattern needs my attention?",
    rng: () => values.shift() ?? 0,
    now: () => new Date("2026-06-05T00:00:00.000Z"),
    idFactory: () => "reading-fixed",
  });

  assert.equal(reading.id, "reading-fixed");
  assert.equal(reading.createdAt, "2026-06-05T00:00:00.000Z");
  assert.equal(reading.cards.length, 3);
  assert.deepEqual(
    reading.cards.map((card) => card.position),
    ["root", "present", "trend"],
  );

  const cardIds = reading.cards.map((card) => card.card.id);
  assert.equal(new Set(cardIds).size, 3);
  assert.ok(cardIds.every((id) => tarotDeck.some((card) => card.id === id)));
});

test("drawThreeCardReading assigns only valid orientations from injectable RNG", () => {
  const values = [0.2, 0.4, 0.6, 0.49, 0.5, 0.99];
  const reading = drawThreeCardReading({
    theme: "career",
    question: "Where should I put my effort?",
    rng: () => values.shift() ?? 0,
  });

  assert.deepEqual(
    reading.cards.map((card) => card.orientation),
    ["upright", "reversed", "reversed"],
  );
});

test("tarotDeck contains all 78 cards with required meaning fields", () => {
  assert.equal(tarotDeck.length, 78);
  assert.equal(new Set(tarotDeck.map((card) => card.id)).size, 78);

  for (const card of tarotDeck) {
    assert.ok(card.name);
    assert.ok(card.keywords.length > 0);
    assert.ok(card.upright);
    assert.ok(card.reversed);
    assert.ok(card.relationshipMeaning);
    assert.ok(card.careerMeaning);
    assert.ok(card.risk);
    assert.ok(card.advice);
  }
});
