import { BIRD_SPECS, resolveBirdId, type BirdId } from '../content/birds';
import { normalizeBirdQueue, resizeBirdQueue } from './birdQueue';

const BIRD_ORDER = BIRD_SPECS.map((bird) => bird.id);

export class LoadoutState {
  selectedLevelIndex = 0;
  selectedSlotIndex = 0;
  birdQueue: BirdId[];

  constructor(private readonly shotCounts: readonly number[]) {
    this.birdQueue = normalizeBirdQueue(undefined, this.shotsForLevel(0));
  }

  get selectedBirdId(): BirdId {
    return this.birdQueue[this.selectedSlotIndex] ?? 'scarlet';
  }

  getSelectedQueue(): BirdId[] {
    return [...this.birdQueue];
  }

  selectLevel(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.shotCounts.length) return false;
    this.selectedLevelIndex = index;
    this.birdQueue = resizeBirdQueue(this.birdQueue, this.shotsForLevel(index));
    this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, this.birdQueue.length - 1));
    return true;
  }

  selectSlot(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.birdQueue.length) return false;
    this.selectedSlotIndex = index;
    return true;
  }

  assignBird(birdId: string): boolean {
    const resolved = resolveBirdId(birdId);
    if (resolved !== birdId || this.birdQueue.length === 0) return false;
    this.birdQueue[this.selectedSlotIndex] = resolved;
    this.selectedSlotIndex = Math.min(this.selectedSlotIndex + 1, this.birdQueue.length - 1);
    return true;
  }

  cycleSelectedBird(direction: number): boolean {
    if (!Number.isFinite(direction) || direction === 0 || this.birdQueue.length === 0) return false;
    const current = BIRD_ORDER.indexOf(this.selectedBirdId);
    const step = direction < 0 ? -1 : 1;
    const next = (current + step + BIRD_ORDER.length) % BIRD_ORDER.length;
    this.birdQueue[this.selectedSlotIndex] = BIRD_ORDER[next];
    return true;
  }

  syncQueue(queue: readonly string[]): void {
    this.birdQueue = normalizeBirdQueue(queue, this.shotsForLevel(this.selectedLevelIndex));
    this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, this.birdQueue.length - 1));
  }

  private shotsForLevel(index: number): number {
    return this.shotCounts[index] ?? 0;
  }
}
