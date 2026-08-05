import { tarotDeck } from "../data/tarot-deck.ts";
import type { DrawnCard, GeneratedReading, Orientation, ReadingTheme, SpreadPosition, TarotCard } from "./types.ts";

export type RandomSource = () => number;

export interface DrawReadingOptions {
  theme: ReadingTheme;
  question: string;
  rng?: RandomSource;
  now?: () => Date;
  idFactory?: () => string;
  deck?: TarotCard[];
}

const spreadPositions: SpreadPosition[] = ["root", "present", "trend"];

function defaultIdFactory(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `reading-${Date.now().toString(36)}-${randomPart}`;
}

function normalizeRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value >= 1) {
    return 0.999999999;
  }

  return value;
}

function drawUniqueCards(deck: TarotCard[], rng: RandomSource): TarotCard[] {
  const pool = [...deck];
  const drawn: TarotCard[] = [];

  for (let index = 0; index < 3; index += 1) {
    const cardIndex = Math.floor(normalizeRandom(rng()) * pool.length);
    const [card] = pool.splice(cardIndex, 1);
    drawn.push(card);
  }

  return drawn;
}

function chooseOrientation(rng: RandomSource): Orientation {
  return normalizeRandom(rng()) < 0.5 ? "upright" : "reversed";
}

export function drawThreeCardReading(options: DrawReadingOptions): GeneratedReading;
export function drawThreeCardReading(theme: ReadingTheme, question: string): GeneratedReading;
export function drawThreeCardReading(optionsOrTheme: DrawReadingOptions | ReadingTheme, question = ""): GeneratedReading {
  const options: DrawReadingOptions =
    typeof optionsOrTheme === "string"
      ? { theme: optionsOrTheme, question }
      : optionsOrTheme;
  const deck = options.deck ?? tarotDeck;

  if (deck.length < 3) {
    throw new Error("A three-card reading requires at least three cards.");
  }

  const rng = options.rng ?? Math.random;
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;
  const selectedCards = drawUniqueCards(deck, rng);
  const cards: DrawnCard[] = selectedCards.map((card, index) => ({
    ...card,
    card,
    position: spreadPositions[index],
    orientation: chooseOrientation(rng),
  }));

  return {
    id: idFactory(),
    createdAt: now().toISOString(),
    theme: options.theme,
    question: options.question.trim(),
    cards,
  };
}

export { spreadPositions };
