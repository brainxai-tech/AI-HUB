import type { BirdId, BirdVelocity } from '../content/birds';

export const GUNNER_DEFLECTION_RADIANS = Math.PI / 8;
export const GUNNER_TRIGGER_FLIGHT_MS = 80;
export const GUNNER_TRIGGER_X = 180;
export const GUNNER_AIM_DURATION_MS = 320;
export const GUNNER_SHOT_TRAVEL_MS = 170;

export type GunnerState = 'loaded' | 'aiming' | 'firing' | 'spent';

export interface GunnerAimInput {
  state: GunnerState;
  flightAge: number;
  birdX: number;
  birdActive: boolean;
}

export interface GunnerShotInput {
  deflectionSign: number;
  birdId: BirdId;
  velocity: BirdVelocity;
}

export interface GunnerShotResult {
  hit: true;
  explode: boolean;
  velocity: BirdVelocity;
}

export function shouldStartGunnerAim(input: GunnerAimInput): boolean {
  return input.state === 'loaded'
    && input.birdActive
    && input.flightAge >= GUNNER_TRIGGER_FLIGHT_MS
    && input.birdX >= GUNNER_TRIGGER_X;
}

export function getGunnerDeflectionSign(gunnerY: number, birdY: number): -1 | 1 {
  return birdY < gunnerY ? -1 : 1;
}

export function resolveGunnerShot(input: GunnerShotInput): GunnerShotResult {
  const direction = input.deflectionSign < 0 ? -1 : 1;
  const angle = Math.atan2(input.velocity.y, input.velocity.x) + GUNNER_DEFLECTION_RADIANS * direction;
  const speed = Math.hypot(input.velocity.x, input.velocity.y) * 0.92;
  return {
    hit: true,
    explode: false,
    velocity: {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    },
  };
}
