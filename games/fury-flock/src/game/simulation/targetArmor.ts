export interface TargetDamageResult {
  health: number;
  armorHitsRemaining: number;
  absorbed: boolean;
}

export const TARGET_ARMOR_BREAK_GRACE_MS = 260;

export function isTargetDamageGuarded(now: number, damageGuardUntil: number): boolean {
  return Number.isFinite(now)
    && Number.isFinite(damageGuardUntil)
    && now < damageGuardUntil;
}

export function resolveTargetDamage(
  health: number,
  armorHitsRemaining: number,
  damage: number,
): TargetDamageResult {
  const safeHealth = Number.isFinite(health) ? Math.max(0, health) : 0;
  const safeArmor = Number.isFinite(armorHitsRemaining)
    ? Math.max(0, Math.floor(armorHitsRemaining))
    : 0;
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;

  if (safeDamage === 0) {
    return { health: safeHealth, armorHitsRemaining: safeArmor, absorbed: false };
  }
  if (safeArmor > 0) {
    return { health: safeHealth, armorHitsRemaining: safeArmor - 1, absorbed: true };
  }
  return {
    health: Math.max(0, safeHealth - safeDamage),
    armorHitsRemaining: 0,
    absorbed: false,
  };
}
