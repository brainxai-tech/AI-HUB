import { DEFAULT_BIRD_ID, resolveBirdId, type BirdId } from '../content/birds';

const validBirds = (input: readonly string[] | undefined): BirdId[] =>
  (input ?? []).filter((birdId): birdId is BirdId => resolveBirdId(birdId) === birdId);

export function normalizeBirdQueue(input: readonly string[] | undefined, shots: number): BirdId[] {
  const size = Math.max(0, Math.floor(Number.isFinite(shots) ? shots : 0));
  const valid = validBirds(input);
  return Array.from({ length: size }, (_, index) => valid[index] ?? DEFAULT_BIRD_ID);
}

export function resizeBirdQueue(input: readonly string[] | undefined, shots: number): BirdId[] {
  const size = Math.max(0, Math.floor(Number.isFinite(shots) ? shots : 0));
  const valid = validBirds(input);
  const fill = valid[valid.length - 1] ?? DEFAULT_BIRD_ID;
  return Array.from({ length: size }, (_, index) => valid[index] ?? fill);
}
