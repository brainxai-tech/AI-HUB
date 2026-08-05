import { describe, expect, it } from 'vitest';
import {
  GALE_SPLIT_BATTLEFIELD_X,
  GALE_SPLIT_MAX_DELAY_MS,
  GALE_SPLIT_MIN_DELAY_MS,
  GALE_SPLIT_ORIGIN_HOLD_MS,
  GALE_SPLIT_TARGET_PROXIMITY,
  IRON_LAUNCH_CLEARANCE_DISTANCE,
  IRON_BLAST_RADIUS,
  SCARLET_PRECISION_ALIGNMENT_THRESHOLD,
  VERDANT_PHASE_MAX_MS,
  VERDANT_PHASE_MIN_MS,
  computeScarletPrecisionAlignment,
  computeExplosionDamage,
  computeSplitSpawnPositions,
  hasClearedIronLaunchZone,
  computeObstacleExitPosition,
  computeObstaclePhaseDuration,
  computeSplitVelocities,
  shouldResolveFlightTurn,
  isScarletPrecisionImpact,
  resolveGaleSplitTrigger,
  shouldAutoSplit,
  shouldDetonateOnImpact,
  shouldPhaseFirstObstacle,
} from '../src/game/simulation/birdAbilities';

describe('automatic bird abilities', () => {
  it('splits gale at a visible battlefield opportunity with a one-second fallback', () => {
    expect(shouldAutoSplit({
      birdId: 'gale',
      flightAge: GALE_SPLIT_MIN_DELAY_MS - 1,
      consumed: false,
      positionX: GALE_SPLIT_BATTLEFIELD_X + 100,
    })).toBe(false);
    expect(resolveGaleSplitTrigger({
      birdId: 'gale',
      flightAge: GALE_SPLIT_MIN_DELAY_MS,
      consumed: false,
      positionX: GALE_SPLIT_BATTLEFIELD_X - 1,
      nearestTargetDistance: GALE_SPLIT_TARGET_PROXIMITY + 1,
    })).toBeNull();
    expect(resolveGaleSplitTrigger({
      birdId: 'gale',
      flightAge: GALE_SPLIT_MIN_DELAY_MS,
      consumed: false,
      positionX: GALE_SPLIT_BATTLEFIELD_X,
    })).toBe('battlefield');
    expect(resolveGaleSplitTrigger({
      birdId: 'gale',
      flightAge: GALE_SPLIT_MIN_DELAY_MS,
      consumed: false,
      nearestTargetDistance: GALE_SPLIT_TARGET_PROXIMITY,
    })).toBe('target-proximity');
    expect(resolveGaleSplitTrigger({
      birdId: 'gale',
      flightAge: GALE_SPLIT_MAX_DELAY_MS,
      consumed: false,
    })).toBe('timeout');
    expect(resolveGaleSplitTrigger({
      birdId: 'gale',
      flightAge: GALE_SPLIT_MAX_DELAY_MS,
      consumed: true,
    })).toBeNull();
    expect(resolveGaleSplitTrigger({
      birdId: 'scarlet',
      flightAge: GALE_SPLIT_MAX_DELAY_MS,
      consumed: false,
    })).toBeNull();
  });

  it('rewards only fast scarlet hits aligned with the obstacle centerline', () => {
    const centered = {
      birdId: 'scarlet' as const,
      birdPosition: { x: 80, y: 150 },
      obstacleBounds: { min: { x: 100, y: 100 }, max: { x: 140, y: 200 } },
      relativeVelocity: { x: 12, y: 1 },
    };
    expect(computeScarletPrecisionAlignment(centered)).toBe(0);
    expect(isScarletPrecisionImpact(centered)).toBe(true);
    expect(isScarletPrecisionImpact({
      ...centered,
      birdPosition: { x: 80, y: 150 + 50 * (SCARLET_PRECISION_ALIGNMENT_THRESHOLD + 0.01) },
    })).toBe(false);
    expect(isScarletPrecisionImpact({ ...centered, relativeVelocity: { x: 4, y: 0 } })).toBe(false);
    expect(isScarletPrecisionImpact({ ...centered, birdId: 'verdant' })).toBe(false);
  });

  it('arms iron only after it clears the spatial launch safety zone', () => {
    const slingX = 218;
    expect(hasClearedIronLaunchZone(
      slingX + IRON_LAUNCH_CLEARANCE_DISTANCE - 1,
      slingX,
    )).toBe(false);
    expect(hasClearedIronLaunchZone(
      slingX + IRON_LAUNCH_CLEARANCE_DISTANCE,
      slingX,
    )).toBe(true);
    expect(shouldDetonateOnImpact({
      birdId: 'iron',
      launchCleared: false,
      consumed: false,
    })).toBe(false);
    expect(shouldDetonateOnImpact({
      birdId: 'iron',
      launchCleared: true,
      consumed: false,
    })).toBe(true);
    expect(shouldDetonateOnImpact({
      birdId: 'iron',
      launchCleared: true,
      consumed: true,
    })).toBe(false);
    expect(shouldDetonateOnImpact({
      birdId: 'gale',
      launchCleared: true,
      consumed: false,
    })).toBe(false);
  });

  it('creates three forward-moving paths with a readable vertical spread', () => {
    const paths = computeSplitVelocities({ x: 16, y: -3 });
    expect(paths).toHaveLength(3);
    expect(paths[0].x).toBeGreaterThan(15);
    expect(paths[0].y).toBeLessThan(paths[1].y);
    expect(paths[1].y).toBe(-3);
    expect(paths[2].y).toBeGreaterThan(paths[1].y);
  });

  it('holds three split bodies at independent copies of the exact trigger origin', () => {
    expect(GALE_SPLIT_ORIGIN_HOLD_MS).toBeGreaterThanOrEqual(80);
    const origin = { x: 612.5, y: 328.25 };
    const positions = computeSplitSpawnPositions(origin);
    expect(positions).toEqual([origin, origin, origin]);
    expect(positions[0]).not.toBe(positions[1]);
    expect(positions[1]).not.toBe(positions[2]);
  });

  it('waits for every split body before resolving the turn', () => {
    expect(shouldResolveFlightTurn([
      { outOfPlay: false, settledForMs: 901 },
      { outOfPlay: false, settledForMs: 0 },
      { outOfPlay: true, settledForMs: 0 },
    ], 2_400)).toBe(false);
    expect(shouldResolveFlightTurn([
      { outOfPlay: false, settledForMs: 901 },
      { outOfPlay: false, settledForMs: 901 },
      { outOfPlay: true, settledForMs: 0 },
    ], 2_400)).toBe(true);
    expect(shouldResolveFlightTurn([
      { outOfPlay: false, settledForMs: 0 },
    ], 11_001)).toBe(true);
  });

  it('applies bounded radial damage once per target opportunity', () => {
    expect(computeExplosionDamage(0)).toBe(30);
    expect(computeExplosionDamage(IRON_BLAST_RADIUS / 2)).toBeGreaterThan(9);
    expect(computeExplosionDamage(IRON_BLAST_RADIUS)).toBe(9);
    expect(computeExplosionDamage(IRON_BLAST_RADIUS + 0.01)).toBe(0);
  });

  it('lets only an unused verdant bird phase through a building obstacle', () => {
    expect(shouldPhaseFirstObstacle({ birdId: 'verdant', consumed: false, isObstacle: true })).toBe(true);
    expect(shouldPhaseFirstObstacle({ birdId: 'verdant', consumed: true, isObstacle: true })).toBe(false);
    expect(shouldPhaseFirstObstacle({ birdId: 'verdant', consumed: false, isObstacle: false })).toBe(false);
    expect(shouldPhaseFirstObstacle({ birdId: 'scarlet', consumed: false, isObstacle: true })).toBe(false);
  });

  it('bounds the phase window while allowing wider obstacles more crossing time', () => {
    const narrow = computeObstaclePhaseDuration(34, 16);
    const wide = computeObstaclePhaseDuration(190, 16);
    expect(narrow).toBeGreaterThanOrEqual(VERDANT_PHASE_MIN_MS);
    expect(wide).toBeGreaterThan(narrow);
    expect(computeObstaclePhaseDuration(10_000, 1)).toBe(VERDANT_PHASE_MAX_MS);
  });

  it('places a phasing bird completely beyond the obstacle before collisions return', () => {
    const bounds = { min: { x: 100, y: 200 }, max: { x: 180, y: 320 } };
    expect(computeObstacleExitPosition(
      bounds,
      { x: 20, y: 20 },
      { x: 16, y: -1 },
      { x: 140, y: 250 },
    )).toEqual({ x: 202, y: 250 });
    expect(computeObstacleExitPosition(
      bounds,
      { x: 20, y: 20 },
      { x: -16, y: 1 },
      { x: 140, y: 250 },
    )).toEqual({ x: 78, y: 250 });
  });
});
