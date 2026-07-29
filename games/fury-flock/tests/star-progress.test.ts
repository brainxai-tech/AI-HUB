import { describe, expect, it } from 'vitest';
import {
  STAR_PROGRESS_STORAGE_KEY,
  StarProgressStore,
  calculateStarRating,
  getStarRequirements,
  type ProgressStorage,
} from '../src/game/progression/starProgress';

class MemoryStorage implements ProgressStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('level star ratings', () => {
  it('awards zero for failure and one to three stars by remaining ammunition', () => {
    expect(calculateStarRating(false, 4)).toBe(0);
    expect(calculateStarRating(true, 0)).toBe(1);
    expect(calculateStarRating(true, 1)).toBe(2);
    expect(calculateStarRating(true, 2)).toBe(3);
    expect(calculateStarRating(true, 5)).toBe(3);
  });

  it('turns each level ammunition count into explicit requirements', () => {
    expect(getStarRequirements(4)).toMatchObject({
      twoStarMaxShots: 3,
      threeStarMaxShots: 2,
      twoStars: '最多使用 3 发（至少剩 1 枚怒羽）',
      threeStars: '最多使用 2 发（至少剩 2 枚怒羽）',
    });
    expect(getStarRequirements(5)).toMatchObject({
      twoStarMaxShots: 4,
      threeStarMaxShots: 3,
    });
  });

  it('persists only the highest rating for each level', () => {
    const storage = new MemoryStorage();
    const progress = new StarProgressStore(storage, 40);

    expect(progress.record(3, 2)).toEqual({ previous: 0, best: 2, improved: true });
    expect(progress.record(3, 1)).toEqual({ previous: 2, best: 2, improved: false });
    expect(progress.record(3, 0)).toEqual({ previous: 2, best: 2, improved: false });
    expect(progress.record(3, 3)).toEqual({ previous: 2, best: 3, improved: true });

    const restored = new StarProgressStore(storage, 40);
    expect(restored.getBest(3)).toBe(3);
    expect(restored.getTotal()).toBe(3);
  });

  it('normalizes malformed saved data instead of trusting invalid stars', () => {
    const storage = new MemoryStorage();
    storage.setItem(STAR_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      bestStars: [3, 8, -1, '2', 1],
    }));

    const progress = new StarProgressStore(storage, 5);
    expect(progress.getAll()).toEqual([3, 0, 0, 0, 1]);
  });
});
