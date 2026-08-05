import { describe, expect, it } from 'vitest';
import {
  TARGET_ARMOR_BREAK_GRACE_MS,
  isTargetDamageGuarded,
} from '../src/game/simulation/targetArmor';

interface ArmorResult {
  health: number;
  armorHitsRemaining: number;
  absorbed: boolean;
}

interface ArmorModule {
  resolveTargetDamage: (health: number, armorHitsRemaining: number, damage: number) => ArmorResult;
}

const loadArmorModule = async (): Promise<ArmorModule | null> => {
  const modulePath = '../src/game/simulation/' + 'targetArmor.ts';
  return import(modulePath).catch(() => null) as Promise<ArmorModule | null>;
};

describe('armored Moss-Snout damage', () => {
  it('uses the helmet to absorb the first valid hit without losing health', async () => {
    const module = await loadArmorModule();
    expect(module).not.toBeNull();
    if (!module) return;

    expect(module.resolveTargetDamage(15, 1, 8)).toEqual({
      health: 15,
      armorHitsRemaining: 0,
      absorbed: true,
    });
  });

  it('applies later hits normally after the helmet has broken', async () => {
    const module = await loadArmorModule();
    expect(module).not.toBeNull();
    if (!module) return;

    expect(module.resolveTargetDamage(15, 0, 8)).toEqual({
      health: 7,
      armorHitsRemaining: 0,
      absorbed: false,
    });
  });

  it('does not spend armor on zero or invalid damage', async () => {
    const module = await loadArmorModule();
    expect(module).not.toBeNull();
    if (!module) return;

    expect(module.resolveTargetDamage(15, 1, 0)).toEqual({
      health: 15,
      armorHitsRemaining: 1,
      absorbed: false,
    });
    expect(module.resolveTargetDamage(15, 1, Number.NaN)).toEqual({
      health: 15,
      armorHitsRemaining: 1,
      absorbed: false,
    });
  });

  it('guards the broken target from same-impact collision cascades for a short readable window', () => {
    const brokenAt = 1_000;
    const guardUntil = brokenAt + TARGET_ARMOR_BREAK_GRACE_MS;
    expect(TARGET_ARMOR_BREAK_GRACE_MS).toBeGreaterThanOrEqual(200);
    expect(isTargetDamageGuarded(brokenAt + 90, guardUntil)).toBe(true);
    expect(isTargetDamageGuarded(guardUntil, guardUntil)).toBe(false);
  });
});
