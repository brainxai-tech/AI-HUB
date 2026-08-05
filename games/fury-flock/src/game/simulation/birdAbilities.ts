import type { BirdId, BirdVelocity } from '../content/birds';

export const GALE_SPLIT_MIN_DELAY_MS = 480;
export const GALE_SPLIT_MAX_DELAY_MS = 1_000;
export const GALE_SPLIT_ORIGIN_HOLD_MS = 90;
export const GALE_SPLIT_BATTLEFIELD_X = 590;
export const GALE_SPLIT_TARGET_PROXIMITY = 360;
export const GALE_SPLIT_SCALE = 0.63;
export const GALE_SPLIT_RADIUS = 20;
export const SCARLET_PRECISION_MIN_SPEED = 8;
export const SCARLET_PRECISION_ALIGNMENT_THRESHOLD = 0.34;
export const SCARLET_PRECISION_DAMAGE_MULTIPLIER = 1.32;
export const SCARLET_PRECISION_SCORE_BONUS = 320;
export const IRON_LAUNCH_CLEARANCE_DISTANCE = 150;
export const IRON_BLAST_RADIUS = 168;
export const IRON_BLAST_MAX_DAMAGE = 30;
export const IRON_BLAST_EDGE_DAMAGE = 9;
export const VERDANT_PHASE_MIN_MS = 110;
export const VERDANT_PHASE_MAX_MS = 420;
export const FLIGHT_SETTLE_DURATION_MS = 900;
export const MAX_FLIGHT_DURATION_MS = 11_000;

export interface FlightBodyResolutionState {
  outOfPlay: boolean;
  settledForMs: number;
}

export function shouldResolveFlightTurn(
  bodies: readonly FlightBodyResolutionState[],
  flightAge: number,
): boolean {
  if (flightAge > MAX_FLIGHT_DURATION_MS) return true;
  return bodies.length > 0
    && bodies.every((body) => body.outOfPlay || body.settledForMs > FLIGHT_SETTLE_DURATION_MS);
}

interface AutoSplitState {
  birdId: BirdId;
  flightAge: number;
  consumed: boolean;
  positionX?: number;
  nearestTargetDistance?: number;
}

export type GaleSplitTrigger = 'battlefield' | 'target-proximity' | 'timeout';

export function resolveGaleSplitTrigger(state: AutoSplitState): GaleSplitTrigger | null {
  if (state.birdId !== 'gale' || state.consumed) return null;
  if (state.flightAge >= GALE_SPLIT_MAX_DELAY_MS) return 'timeout';
  if (state.flightAge < GALE_SPLIT_MIN_DELAY_MS) return null;
  if (Number.isFinite(state.nearestTargetDistance)
    && Number(state.nearestTargetDistance) <= GALE_SPLIT_TARGET_PROXIMITY) return 'target-proximity';
  if (Number.isFinite(state.positionX) && Number(state.positionX) >= GALE_SPLIT_BATTLEFIELD_X) return 'battlefield';
  return null;
}

export function shouldAutoSplit(state: AutoSplitState): boolean {
  return resolveGaleSplitTrigger(state) !== null;
}

interface PrecisionBounds {
  min: BirdVelocity;
  max: BirdVelocity;
}

interface ScarletPrecisionState {
  birdId: BirdId;
  birdPosition: BirdVelocity;
  obstacleBounds: PrecisionBounds;
  relativeVelocity: BirdVelocity;
}

export function computeScarletPrecisionAlignment(state: ScarletPrecisionState): number {
  const horizontal = Math.abs(state.relativeVelocity.x) >= Math.abs(state.relativeVelocity.y);
  const center = horizontal
    ? (state.obstacleBounds.min.y + state.obstacleBounds.max.y) / 2
    : (state.obstacleBounds.min.x + state.obstacleBounds.max.x) / 2;
  const halfExtent = horizontal
    ? (state.obstacleBounds.max.y - state.obstacleBounds.min.y) / 2
    : (state.obstacleBounds.max.x - state.obstacleBounds.min.x) / 2;
  const birdAxis = horizontal ? state.birdPosition.y : state.birdPosition.x;
  return Math.abs(birdAxis - center) / Math.max(1, halfExtent);
}

export function isScarletPrecisionImpact(state: ScarletPrecisionState): boolean {
  if (state.birdId !== 'scarlet') return false;
  if (Math.hypot(state.relativeVelocity.x, state.relativeVelocity.y) < SCARLET_PRECISION_MIN_SPEED) return false;
  return computeScarletPrecisionAlignment(state) <= SCARLET_PRECISION_ALIGNMENT_THRESHOLD;
}

interface ImpactBlastState {
  birdId: BirdId;
  launchCleared: boolean;
  consumed: boolean;
}

export function hasClearedIronLaunchZone(birdX: number, slingAnchorX: number): boolean {
  return Number.isFinite(birdX)
    && Number.isFinite(slingAnchorX)
    && birdX >= slingAnchorX + IRON_LAUNCH_CLEARANCE_DISTANCE;
}

export function shouldDetonateOnImpact(state: ImpactBlastState): boolean {
  return state.birdId === 'iron'
    && !state.consumed
    && state.launchCleared;
}

export function computeSplitVelocities(velocity: BirdVelocity): [BirdVelocity, BirdVelocity, BirdVelocity] {
  const forwardX = velocity.x * 0.98;
  return [
    { x: forwardX, y: velocity.y - 2.7 },
    { x: forwardX, y: velocity.y },
    { x: forwardX, y: velocity.y + 2.7 },
  ];
}

export function computeSplitSpawnPositions(
  origin: BirdVelocity,
): [BirdVelocity, BirdVelocity, BirdVelocity] {
  return [{ ...origin }, { ...origin }, { ...origin }];
}

export function computeExplosionDamage(distance: number, radius = IRON_BLAST_RADIUS): number {
  if (!Number.isFinite(distance) || distance < 0 || distance > radius || radius <= 0) return 0;
  const falloff = 1 - distance / radius;
  return IRON_BLAST_EDGE_DAMAGE + (IRON_BLAST_MAX_DAMAGE - IRON_BLAST_EDGE_DAMAGE) * falloff;
}

interface FirstObstaclePhaseState {
  birdId: BirdId;
  consumed: boolean;
  isObstacle: boolean;
}

export function shouldPhaseFirstObstacle(state: FirstObstaclePhaseState): boolean {
  return state.birdId === 'verdant' && !state.consumed && state.isObstacle;
}

export function computeObstaclePhaseDuration(obstacleExtent: number, speed: number): number {
  const safeExtent = Number.isFinite(obstacleExtent) ? Math.max(0, obstacleExtent) : 0;
  const safeSpeed = Number.isFinite(speed) ? Math.max(4, Math.abs(speed)) : 4;
  const crossingMs = safeExtent / safeSpeed * (1_000 / 60) + 72;
  return Math.round(Math.min(VERDANT_PHASE_MAX_MS, Math.max(VERDANT_PHASE_MIN_MS, crossingMs)));
}

interface PhaseBounds {
  min: BirdVelocity;
  max: BirdVelocity;
}

export function computeObstacleExitPosition(
  obstacleBounds: PhaseBounds,
  birdHalfExtents: BirdVelocity,
  velocity: BirdVelocity,
  currentPosition: BirdVelocity,
): BirdVelocity {
  const horizontal = Math.abs(velocity.x) >= Math.abs(velocity.y);
  if (horizontal) {
    return {
      x: velocity.x >= 0
        ? obstacleBounds.max.x + birdHalfExtents.x + 2
        : obstacleBounds.min.x - birdHalfExtents.x - 2,
      y: currentPosition.y,
    };
  }
  return {
    x: currentPosition.x,
    y: velocity.y >= 0
      ? obstacleBounds.max.y + birdHalfExtents.y + 2
      : obstacleBounds.min.y - birdHalfExtents.y - 2,
  };
}
