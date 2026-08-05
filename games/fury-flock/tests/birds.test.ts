import { describe, expect, it } from 'vitest';

interface BirdModule {
  BIRD_SPECS: Array<{ id: string; ability: string; impactCue: string; assetPath: string; spriteSize: number }>;
  FUTURE_BIRD_SPECS: Array<{
    id: string;
    ability: string;
    assetPath: string;
    releaseChapter: number;
    unlockRequirement: string;
  }>;
  ALL_BIRD_CODEX_SPECS: Array<{ id: string; abilityName: string; assetPath: string }>;
  BIRD_RECOMMENDATIONS: string[];
  computeLaunchVelocity: (birdId: string, pull: { x: number; y: number }) => { x: number; y: number };
  resolveBirdId: (birdId: string | undefined) => string;
}

const loadBirdModule = async (): Promise<BirdModule | null> => {
  const modulePath = '../src/game/content/' + 'birds.ts';
  return import(modulePath).catch(() => null) as Promise<BirdModule | null>;
};

describe('bird loadout content', () => {
  it('offers four distinct birds and one recommendation per level', async () => {
    const birds = await loadBirdModule();
    expect(birds).not.toBeNull();
    if (!birds) return;

    expect(birds.BIRD_SPECS.map((bird) => bird.id)).toEqual(['scarlet', 'iron', 'gale', 'verdant']);
    expect(new Set(birds.BIRD_SPECS.map((bird) => bird.impactCue)).size).toBe(4);
    expect(new Set(birds.BIRD_SPECS.map((bird) => bird.assetPath)).size).toBe(4);
    expect(birds.BIRD_SPECS.every((bird) => bird.assetPath.endsWith('.png'))).toBe(true);
    expect(birds.BIRD_SPECS.every((bird) => bird.spriteSize >= 80)).toBe(true);
    expect(birds.BIRD_RECOMMENDATIONS).toHaveLength(40);
    expect(birds.BIRD_RECOMMENDATIONS.slice(13, 23)).toEqual([
      'verdant',
      'gale',
      'scarlet',
      'iron',
      'verdant',
      'verdant',
      'scarlet',
      'gale',
      'iron',
      'scarlet',
    ]);
    expect(birds.BIRD_RECOMMENDATIONS.slice(23, 31)).toEqual([
      'verdant',
      'gale',
      'scarlet',
      'iron',
      'verdant',
      'gale',
      'iron',
      'scarlet',
    ]);
    expect(birds.BIRD_RECOMMENDATIONS.slice(31, 36)).toEqual([
      'scarlet',
      'verdant',
      'gale',
      'iron',
      'scarlet',
    ]);
    expect(birds.BIRD_RECOMMENDATIONS.slice(36)).toEqual([
      'verdant',
      'gale',
      'iron',
      'scarlet',
    ]);
  });

  it('gives all four birds distinct automatic traits without mid-flight input', async () => {
    const birds = await loadBirdModule();
    expect(birds).not.toBeNull();
    if (!birds) return;

    expect(birds.BIRD_SPECS.map((bird) => bird.ability)).toEqual([
      'precision-strike',
      'impact-blast',
      'auto-split',
      'first-obstacle-phase',
    ]);
  });

  it('keeps two distinct chapter-two birds in the locked codex instead of the first-chapter loadout', async () => {
    const birds = await loadBirdModule();
    expect(birds).not.toBeNull();
    if (!birds) return;

    expect(birds.FUTURE_BIRD_SPECS.map((bird) => bird.id)).toEqual(['violet', 'frost']);
    expect(birds.FUTURE_BIRD_SPECS.map((bird) => bird.ability)).toEqual(['magnetic-yank', 'target-return']);
    expect(birds.FUTURE_BIRD_SPECS.every((bird) => bird.releaseChapter === 2)).toBe(true);
    expect(birds.FUTURE_BIRD_SPECS.every((bird) => bird.unlockRequirement.length > 0)).toBe(true);
    expect(new Set(birds.ALL_BIRD_CODEX_SPECS.map((bird) => bird.id)).size).toBe(6);
    expect(new Set(birds.ALL_BIRD_CODEX_SPECS.map((bird) => bird.abilityName)).size).toBe(6);
    expect(new Set(birds.ALL_BIRD_CODEX_SPECS.map((bird) => bird.assetPath)).size).toBe(6);
    expect(birds.BIRD_SPECS.map((bird) => bird.id)).not.toContain('violet');
    expect(birds.BIRD_SPECS.map((bird) => bird.id)).not.toContain('frost');
    expect(birds.resolveBirdId('violet')).toBe('scarlet');
    expect(birds.resolveBirdId('frost')).toBe('scarlet');
  });

  it('orders launch arcs from high gale to balanced scarlet to low iron', async () => {
    const birds = await loadBirdModule();
    expect(birds).not.toBeNull();
    if (!birds) return;

    expect(typeof birds.computeLaunchVelocity).toBe('function');
    const pull = { x: 112, y: -48 };
    const gale = birds.computeLaunchVelocity('gale', pull);
    const scarlet = birds.computeLaunchVelocity('scarlet', pull);
    const iron = birds.computeLaunchVelocity('iron', pull);

    expect(gale.y).toBeLessThan(scarlet.y);
    expect(scarlet.y).toBeLessThan(iron.y);
  });

  it('falls back to the balanced bird for unknown selections', async () => {
    const birds = await loadBirdModule();
    expect(birds).not.toBeNull();
    if (!birds) return;

    expect(birds.resolveBirdId('unknown')).toBe('scarlet');
    expect(birds.resolveBirdId(undefined)).toBe('scarlet');
  });
});
