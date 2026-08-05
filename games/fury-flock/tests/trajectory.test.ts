import { describe, expect, it } from 'vitest';
import { sampleBallisticTrajectory } from '../src/game/simulation/trajectory';

describe('sampleBallisticTrajectory', () => {
  it('matches Matter discrete gravity integration from the first flight tick', () => {
    const point = sampleBallisticTrajectory(
      { x: 100, y: 500 },
      { x: 16, y: -7 },
      12,
    );

    expect(point).toEqual({ x: 292, y: 438.75 });
  });
});
