import { describe, expect, it } from 'vitest';

interface LoadoutStateInstance {
  selectedLevelIndex: number;
  selectedSlotIndex: number;
  birdQueue: string[];
  selectLevel: (index: number) => boolean;
  selectSlot: (index: number) => boolean;
  assignBird: (birdId: string) => boolean;
  cycleSelectedBird: (direction: number) => boolean;
  syncQueue: (queue: string[]) => void;
}

interface LoadoutModule {
  LoadoutState: new (shotCounts: readonly number[]) => LoadoutStateInstance;
}

interface QueueModule {
  normalizeBirdQueue: (input: readonly string[] | undefined, shots: number) => string[];
  resizeBirdQueue: (input: readonly string[] | undefined, shots: number) => string[];
}

const loadStateModule = async (): Promise<LoadoutModule | null> => {
  const modulePath = '../src/game/simulation/' + 'LoadoutState.ts';
  return import(modulePath).catch(() => null) as Promise<LoadoutModule | null>;
};

const loadQueueModule = async (): Promise<QueueModule | null> => {
  const modulePath = '../src/game/simulation/' + 'birdQueue.ts';
  return import(modulePath).catch(() => null) as Promise<QueueModule | null>;
};

describe('LoadoutState ordered bird ammunition', () => {
  it('defaults every ammunition slot to Scarlet', async () => {
    const module = await loadStateModule();
    expect(module).not.toBeNull();
    if (!module) return;

    const shotCounts = [4, 4, 4, 4, 4, 4, 4, 5];
    const state = new module.LoadoutState(shotCounts);
    expect(state.selectedLevelIndex).toBe(0);
    expect(state.selectedSlotIndex).toBe(0);
    expect(state.birdQueue).toEqual(['scarlet', 'scarlet', 'scarlet', 'scarlet']);
    for (const [levelIndex, shots] of shotCounts.entries()) {
      expect(state.selectLevel(levelIndex)).toBe(true);
      expect(state.birdQueue).toEqual(Array.from({ length: shots }, () => 'scarlet'));
    }
  });

  it('assigns one bird per slot and advances without wrapping', async () => {
    const module = await loadStateModule();
    expect(module).not.toBeNull();
    if (!module) return;

    const state = new module.LoadoutState([4]);
    expect(state.assignBird('iron')).toBe(true);
    expect(state.assignBird('gale')).toBe(true);
    expect(state.birdQueue).toEqual(['iron', 'gale', 'scarlet', 'scarlet']);
    expect(state.selectedSlotIndex).toBe(2);
    expect(state.selectSlot(3)).toBe(true);
    expect(state.assignBird('iron')).toBe(true);
    expect(state.selectedSlotIndex).toBe(3);
    expect(state.assignBird('verdant')).toBe(true);
    expect(state.birdQueue[3]).toBe('verdant');
  });

  it('preserves order while resizing for a new level', async () => {
    const module = await loadStateModule();
    expect(module).not.toBeNull();
    if (!module) return;

    const state = new module.LoadoutState([4, 5]);
    state.assignBird('iron');
    state.assignBird('gale');
    expect(state.selectLevel(1)).toBe(true);
    expect(state.birdQueue).toEqual(['iron', 'gale', 'scarlet', 'scarlet', 'scarlet']);
    state.selectSlot(4);
    state.assignBird('iron');
    expect(state.selectLevel(0)).toBe(true);
    expect(state.birdQueue).toEqual(['iron', 'gale', 'scarlet', 'scarlet']);
    expect(state.selectedSlotIndex).toBe(3);
  });

  it('cycles only the selected ammunition slot', async () => {
    const module = await loadStateModule();
    expect(module).not.toBeNull();
    if (!module) return;

    const state = new module.LoadoutState([4]);
    state.selectSlot(1);
    expect(state.cycleSelectedBird(1)).toBe(true);
    expect(state.birdQueue).toEqual(['scarlet', 'iron', 'scarlet', 'scarlet']);
    expect(state.cycleSelectedBird(-1)).toBe(true);
    expect(state.birdQueue[1]).toBe('scarlet');
  });

  it('normalizes malformed queues and rejects invalid edits', async () => {
    const [stateModule, queueModule] = await Promise.all([loadStateModule(), loadQueueModule()]);
    expect(stateModule).not.toBeNull();
    expect(queueModule).not.toBeNull();
    if (!stateModule || !queueModule) return;

    expect(queueModule.normalizeBirdQueue(['unknown', 'iron'], 4))
      .toEqual(['iron', 'scarlet', 'scarlet', 'scarlet']);
    expect(queueModule.normalizeBirdQueue(['gale'], 3)).toEqual(['gale', 'scarlet', 'scarlet']);
    expect(queueModule.normalizeBirdQueue(undefined, 2)).toEqual(['scarlet', 'scarlet']);
    expect(queueModule.resizeBirdQueue(['gale'], 3)).toEqual(['gale', 'gale', 'gale']);

    const state = new stateModule.LoadoutState([4]);
    expect(state.selectSlot(9)).toBe(false);
    expect(state.assignBird('unknown')).toBe(false);
    state.syncQueue(['gale', 'bad']);
    expect(state.birdQueue).toEqual(['gale', 'scarlet', 'scarlet', 'scarlet']);
  });
});
