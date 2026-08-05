import { describe, expect, it } from 'vitest';
import { BirdTelemetry, type BirdShotTelemetry } from '../src/game/simulation/BirdTelemetry';

interface TelemetrySnapshot {
  comparisonStatus: string;
  completedShots: BirdShotTelemetry[];
  activeShot: BirdShotTelemetry | null;
  aggregate: Record<string, {
    shots: number;
    totalScore: number;
    averageScorePerShot: number;
    damageDealt: number;
    destroyedBlocks: number;
    precisionHits: number;
    abilityTriggers: number;
  }>;
}

describe('BirdTelemetry', () => {
  it('records causal score, damage, destruction, and ability events per shot', () => {
    const telemetry = new BirdTelemetry();
    telemetry.beginShot({
      level: 1,
      birdId: 'scarlet',
      startedAt: 1_000,
      launchVelocity: { x: 16, y: -4 },
      startScore: 100,
    });
    telemetry.recordAbility({ at: 1_500, ability: 'precision-strike', score: 320 });
    telemetry.recordImpact({
      at: 1_500,
      source: 'direct',
      kind: 'block',
      material: 'wood',
      damageDealt: 24,
      score: 120,
      absorbed: false,
      precision: true,
    });
    telemetry.recordDestruction({ at: 1_510, kind: 'block', material: 'wood', score: 450 });
    telemetry.endShot({ endedAt: 2_000, endScore: 990, endReason: 'next-shot' });

    const report = telemetry.snapshot() as unknown as TelemetrySnapshot;
    expect(report.comparisonStatus).toBe('instrumented-not-run');
    expect(report.activeShot).toBeNull();
    expect(report.completedShots).toHaveLength(1);
    expect(report.completedShots[0]).toMatchObject({
      birdId: 'scarlet',
      durationMs: 1_000,
      scoreDelta: 890,
      scoreBreakdown: { impact: 120, destruction: 450, ability: 320, completion: 0 },
      impacts: 1,
      damageDealt: 24,
      destroyedBlocks: 1,
      precisionHits: 1,
      endReason: 'next-shot',
    });
    expect(report.aggregate.scarlet).toMatchObject({
      shots: 1,
      totalScore: 890,
      averageScorePerShot: 890,
      damageDealt: 24,
      destroyedBlocks: 1,
      precisionHits: 1,
      abilityTriggers: 1,
    });
  });

  it('exposes the active shot without treating it as a completed comparison run', () => {
    const telemetry = new BirdTelemetry();
    telemetry.beginShot({
      level: 2,
      birdId: 'gale',
      startedAt: 50,
      launchVelocity: { x: 14, y: -8 },
      startScore: 0,
    });

    const report = telemetry.snapshot() as unknown as TelemetrySnapshot;
    expect(report.completedShots).toEqual([]);
    expect(report.activeShot).toMatchObject({ birdId: 'gale', launchVelocity: { x: 14, y: -8 } });
    expect(report.aggregate.gale.shots).toBe(0);
  });
});
