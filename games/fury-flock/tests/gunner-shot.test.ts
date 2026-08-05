import { describe, expect, it } from 'vitest';
import {
  GUNNER_AIM_DURATION_MS,
  GUNNER_DEFLECTION_RADIANS,
  GUNNER_TRIGGER_FLIGHT_MS,
  GUNNER_TRIGGER_X,
  getGunnerDeflectionSign,
  resolveGunnerShot,
  shouldStartGunnerAim,
} from '../src/game/simulation/gunnerShot';

describe('Firelock Sentry deterministic interception', () => {
  it('starts one readable aim lifecycle only after the bird enters the battlefield', () => {
    expect(GUNNER_AIM_DURATION_MS).toBeGreaterThanOrEqual(300);
    expect(shouldStartGunnerAim({
      state: 'loaded',
      flightAge: GUNNER_TRIGGER_FLIGHT_MS,
      birdX: GUNNER_TRIGGER_X,
      birdActive: true,
    })).toBe(true);
    expect(shouldStartGunnerAim({
      state: 'aiming',
      flightAge: GUNNER_TRIGGER_FLIGHT_MS + 1_000,
      birdX: GUNNER_TRIGGER_X + 500,
      birdActive: true,
    })).toBe(false);
    expect(shouldStartGunnerAim({
      state: 'loaded',
      flightAge: GUNNER_TRIGGER_FLIGHT_MS - 1,
      birdX: GUNNER_TRIGGER_X,
      birdActive: true,
    })).toBe(false);
  });

  it('always deflects an ordinary bird without increasing its speed', () => {
    const velocity = { x: 16, y: -7 };
    const result = resolveGunnerShot({
      deflectionSign: -1,
      birdId: 'gale',
      velocity,
    });
    const originalAngle = Math.atan2(velocity.y, velocity.x);
    const resultAngle = Math.atan2(result.velocity.y, result.velocity.x);

    expect(result.hit).toBe(true);
    expect(result.explode).toBe(false);
    expect(resultAngle).toBeCloseTo(originalAngle - GUNNER_DEFLECTION_RADIANS, 6);
    expect(Math.hypot(result.velocity.x, result.velocity.y))
      .toBeCloseTo(Math.hypot(velocity.x, velocity.y) * 0.92, 6);
  });

  it('chooses a stable deflection direction from the vertical firing geometry', () => {
    expect(getGunnerDeflectionSign(400, 300)).toBe(-1);
    expect(getGunnerDeflectionSign(300, 400)).toBe(1);
    expect(getGunnerDeflectionSign(300, 300)).toBe(1);
  });

  it('deflects the black Iron bird without detonating it in mid-air', () => {
    const result = resolveGunnerShot({
      deflectionSign: 1,
      birdId: 'iron',
      velocity: { x: 14, y: -4 },
    });
    expect(result).toMatchObject({ hit: true, explode: false });
    expect(result.velocity).not.toEqual({ x: 14, y: -4 });
  });
});
