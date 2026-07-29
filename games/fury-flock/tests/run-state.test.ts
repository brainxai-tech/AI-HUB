import { describe, expect, it } from 'vitest';
import { RunState } from '../src/game/simulation/RunState';

describe('RunState', () => {
  it('consumes ammo only for valid launches', () => {
    const state = new RunState();
    state.startLevel(0, 2, 1);
    expect(state.launch()).toBe(true);
    expect(state.launch()).toBe(true);
    expect(state.launch()).toBe(false);
    expect(state.shotsRemaining).toBe(0);
  });

  it('rewards causal destruction chains inside the combo window', () => {
    const state = new RunState();
    state.startLevel(0, 3, 2);
    const first = state.registerDestruction(500, false, 1_000);
    const second = state.registerDestruction(1_000, true, 2_000);
    expect(first).toMatchObject({ points: 500, combo: 1 });
    expect(second).toMatchObject({ points: 2_000, combo: 2, targetsRemaining: 1 });
    expect(state.score).toBe(2_500);
  });

  it('wins when all targets are gone and converts spare ammo to score', () => {
    const state = new RunState(1_000);
    state.startLevel(1, 3, 1);
    state.launch();
    state.registerDestruction(1_500, true, 10);
    expect(state.resolveTurn()).toBe('won');
    expect(state.score).toBe(1_000 + 1_500 + 2 * 2_500);
  });

  it('loses only after ammo is exhausted while targets remain', () => {
    const state = new RunState();
    state.startLevel(0, 1, 1);
    state.launch();
    expect(state.resolveTurn()).toBe('lost');
    expect(state.targetsRemaining).toBe(1);
  });
});
