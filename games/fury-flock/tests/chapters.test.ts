import { describe, expect, it } from 'vitest';
import { CHAPTERS, FIRST_CHAPTER } from '../src/game/content/chapters';
import { LEVELS } from '../src/game/content/levels';

describe('campaign chapters', () => {
  it('packages all forty levels into the first chapter exactly once', () => {
    expect(CHAPTERS).toHaveLength(1);
    expect(FIRST_CHAPTER.number).toBe(1);
    expect(FIRST_CHAPTER.levelIndexes).toHaveLength(LEVELS.length);
    expect(FIRST_CHAPTER.levelIndexes).toEqual(LEVELS.map((_, index) => index));
    expect(new Set(FIRST_CHAPTER.levelIndexes).size).toBe(LEVELS.length);
  });

  it('divides the chapter into five named eight-level acts without gaps', () => {
    expect(FIRST_CHAPTER.acts).toHaveLength(5);
    expect(FIRST_CHAPTER.acts.map((act) => act.name)).toEqual([
      '前哨试翼',
      '云城迷阵',
      '王城风暴',
      '地宫回响',
      '天门终局',
    ]);

    const actLevelIndexes = FIRST_CHAPTER.acts.flatMap((act) =>
      Array.from(
        { length: act.endLevelIndex - act.startLevelIndex + 1 },
        (_, offset) => act.startLevelIndex + offset,
      ));
    expect(actLevelIndexes).toEqual(FIRST_CHAPTER.levelIndexes);
    expect(FIRST_CHAPTER.acts.every((act) => act.endLevelIndex - act.startLevelIndex === 7)).toBe(true);
  });
});
