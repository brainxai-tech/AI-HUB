export const GAME_GRAVITY_Y = 1.05;
export const MATTER_GRAVITY_SCALE = 0.001;
export const MATTER_BASE_DELTA_MS = 1_000 / 60;

export const GRAVITY_PER_TICK = GAME_GRAVITY_Y
  * MATTER_GRAVITY_SCALE
  * MATTER_BASE_DELTA_MS
  * MATTER_BASE_DELTA_MS;

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export function sampleBallisticTrajectory(
  origin: TrajectoryPoint,
  velocity: TrajectoryPoint,
  tick: number,
): TrajectoryPoint {
  return {
    x: origin.x + velocity.x * tick,
    y: origin.y + velocity.y * tick + 0.5 * GRAVITY_PER_TICK * tick * (tick + 1),
  };
}

export function sampleBallisticTrajectoryAtX(
  origin: TrajectoryPoint,
  velocity: TrajectoryPoint,
  targetX: number,
): TrajectoryPoint | null {
  if (velocity.x <= 0 || targetX < origin.x) return null;
  return sampleBallisticTrajectory(origin, velocity, (targetX - origin.x) / velocity.x);
}
