export type StarRating = 0 | 1 | 2 | 3;

export interface StarRequirements {
  oneStar: string;
  twoStars: string;
  threeStars: string;
  twoStarMaxShots: number;
  threeStarMaxShots: number;
}

export interface StarProgressUpdate {
  previous: StarRating;
  best: StarRating;
  improved: boolean;
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredStarProgress {
  version: 1;
  bestStars: StarRating[];
}

export const STAR_PROGRESS_STORAGE_KEY = 'fury-flock:star-progress:v1';

const normalizeStarRating = (value: unknown): StarRating => {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
};

export const calculateStarRating = (won: boolean, shotsRemaining: number): StarRating => {
  if (!won) return 0;
  if (shotsRemaining >= 2) return 3;
  if (shotsRemaining === 1) return 2;
  return 1;
};

export const getStarRequirements = (totalShots: number): StarRequirements => ({
  oneStar: '击破全部目标并通关',
  twoStars: `最多使用 ${Math.max(1, totalShots - 1)} 发（至少剩 1 枚怒羽）`,
  threeStars: `最多使用 ${Math.max(1, totalShots - 2)} 发（至少剩 2 枚怒羽）`,
  twoStarMaxShots: Math.max(1, totalShots - 1),
  threeStarMaxShots: Math.max(1, totalShots - 2),
});

export class StarProgressStore {
  private readonly bestStars: StarRating[];

  constructor(
    private readonly storage: ProgressStorage | undefined,
    private readonly levelCount: number,
  ) {
    this.bestStars = this.read();
  }

  getBest(levelIndex: number): StarRating {
    return this.bestStars[levelIndex] ?? 0;
  }

  getAll(): readonly StarRating[] {
    return [...this.bestStars];
  }

  getTotal(): number {
    return this.bestStars.reduce<number>((total, stars) => total + stars, 0);
  }

  record(levelIndex: number, stars: StarRating): StarProgressUpdate {
    if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= this.levelCount) {
      throw new RangeError(`Invalid level index ${levelIndex}`);
    }

    const previous = this.bestStars[levelIndex] ?? 0;
    const best = Math.max(previous, normalizeStarRating(stars)) as StarRating;
    const improved = best > previous;
    if (improved) {
      this.bestStars[levelIndex] = best;
      this.persist();
    }
    return { previous, best, improved };
  }

  private read(): StarRating[] {
    const empty = Array.from({ length: this.levelCount }, () => 0 as StarRating);
    if (!this.storage) return empty;

    try {
      const raw = this.storage.getItem(STAR_PROGRESS_STORAGE_KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as Partial<StoredStarProgress>;
      if (parsed.version !== 1 || !Array.isArray(parsed.bestStars)) return empty;
      return empty.map((_, index) => normalizeStarRating(parsed.bestStars?.[index]));
    } catch {
      return empty;
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const payload: StoredStarProgress = { version: 1, bestStars: [...this.bestStars] };
    try {
      this.storage.setItem(STAR_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Progress remains available for this session when persistent storage is unavailable.
    }
  }
}

export const createBrowserStarProgress = (levelCount: number): StarProgressStore => {
  try {
    return new StarProgressStore(window.localStorage, levelCount);
  } catch {
    return new StarProgressStore(undefined, levelCount);
  }
};
