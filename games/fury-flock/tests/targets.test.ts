import { describe, expect, it } from 'vitest';

interface TargetArt {
  id: string;
  name: string;
  assetPath: string;
  textureKey: string;
  spriteSize: number;
  collisionRadius: number;
}

interface TargetModule {
  TARGET_ART: TargetArt;
  ARMORED_TARGET_ART: TargetArt;
  GUNNER_TARGET_ART: TargetArt;
  TARGET_PROFILES: Array<{
    id: string;
    stats: string;
    trait: string;
    skillName: string;
    skillDescription: string;
  }>;
  getTargetArt: (options?: { armored?: boolean; gunner?: boolean }) => TargetArt;
}

const loadTargetModule = async (): Promise<TargetModule | null> => {
  const modulePath = '../src/game/content/' + 'targets.ts';
  return import(modulePath).catch(() => null) as Promise<TargetModule | null>;
};

describe('Moss-Snout target art variants', () => {
  it('maps armored targets to a distinct helmet asset with identical runtime geometry', async () => {
    const module = await loadTargetModule();
    expect(module).not.toBeNull();
    if (!module) return;

    expect(module.ARMORED_TARGET_ART).toMatchObject({
      id: 'moss-snout-helmet',
      name: '铁盔苔鼻',
      assetPath: '/assets/targets/moss-snout-helmet.png',
      textureKey: 'enemy-pig-art-moss-snout-helmet',
    });
    expect(module.ARMORED_TARGET_ART.spriteSize).toBe(module.TARGET_ART.spriteSize);
    expect(module.ARMORED_TARGET_ART.collisionRadius).toBe(module.TARGET_ART.collisionRadius);
    expect(module.getTargetArt({ armored: true })).toBe(module.ARMORED_TARGET_ART);
    expect(module.getTargetArt()).toBe(module.TARGET_ART);
  });

  it('maps firelock sentries to a readable third target asset', async () => {
    const module = await loadTargetModule();
    expect(module).not.toBeNull();
    if (!module) return;

    expect(module.GUNNER_TARGET_ART).toMatchObject({
      id: 'moss-snout-gunner',
      name: '火铳哨兵',
      assetPath: '/assets/targets/moss-snout-gunner.png',
      textureKey: 'enemy-pig-art-moss-snout-gunner',
      spriteSize: 88,
      collisionRadius: module.TARGET_ART.collisionRadius,
    });
    expect(module.getTargetArt({ gunner: true })).toBe(module.GUNNER_TARGET_ART);
  });

  it('documents attributes, traits, and skills for every pig variant', async () => {
    const module = await loadTargetModule();
    expect(module).not.toBeNull();
    if (!module) return;

    expect(module.TARGET_PROFILES.map((target) => target.id)).toEqual([
      'moss-snout',
      'moss-snout-helmet',
      'moss-snout-gunner',
    ]);
    expect(module.TARGET_PROFILES.every((target) => target.stats.length > 0)).toBe(true);
    expect(module.TARGET_PROFILES.every((target) => target.trait.length > 0)).toBe(true);
    expect(module.TARGET_PROFILES.every((target) => target.skillName.length > 0)).toBe(true);
    expect(module.TARGET_PROFILES.every((target) => target.skillDescription.length > 0)).toBe(true);
  });
});
