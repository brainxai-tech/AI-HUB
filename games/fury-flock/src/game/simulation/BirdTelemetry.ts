import type { BirdId, BirdVelocity } from '../content/birds';

export type BirdAbilityTelemetryEvent =
  | 'precision-strike'
  | 'impact-blast'
  | 'auto-split'
  | 'first-obstacle-phase';

export type BirdImpactSource = 'direct' | 'ability' | 'physics';
export type BirdShotEndReason = 'next-shot' | 'won' | 'lost' | 'interrupted';

export interface BirdTelemetryEvent {
  atMs: number;
  type: 'impact' | 'destruction' | 'ability';
  source?: BirdImpactSource;
  ability?: BirdAbilityTelemetryEvent;
  kind?: 'block' | 'target';
  material?: string;
  damage?: number;
  score?: number;
  absorbed?: boolean;
  precision?: boolean;
}

export interface BirdShotTelemetry {
  shotId: number;
  level: number;
  birdId: BirdId;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  launchVelocity: BirdVelocity;
  startScore: number;
  endScore: number | null;
  scoreDelta: number;
  scoreBreakdown: {
    impact: number;
    destruction: number;
    ability: number;
    completion: number;
  };
  impacts: number;
  damageDealt: number;
  destroyedBlocks: number;
  destroyedTargets: number;
  precisionHits: number;
  abilityTriggers: Partial<Record<BirdAbilityTelemetryEvent, number>>;
  endReason: BirdShotEndReason | null;
  events: BirdTelemetryEvent[];
}

export interface BirdAggregateTelemetry {
  shots: number;
  totalScore: number;
  averageScorePerShot: number;
  damageDealt: number;
  destroyedBlocks: number;
  destroyedTargets: number;
  precisionHits: number;
  abilityTriggers: number;
}

interface BeginShotInput {
  level: number;
  birdId: BirdId;
  startedAt: number;
  launchVelocity: BirdVelocity;
  startScore: number;
}

interface ImpactInput {
  at: number;
  source: BirdImpactSource;
  kind: 'block' | 'target';
  material: string;
  damageDealt: number;
  score: number;
  absorbed: boolean;
  precision: boolean;
}

interface DestructionInput {
  at: number;
  kind: 'block' | 'target';
  material: string;
  score: number;
}

interface AbilityInput {
  at: number;
  ability: BirdAbilityTelemetryEvent;
  score?: number;
}

interface EndShotInput {
  endedAt: number;
  endScore: number;
  endReason: BirdShotEndReason;
}

const BIRD_IDS: BirdId[] = ['scarlet', 'iron', 'gale', 'verdant'];

function cloneShot(shot: BirdShotTelemetry): BirdShotTelemetry {
  return {
    ...shot,
    launchVelocity: { ...shot.launchVelocity },
    scoreBreakdown: { ...shot.scoreBreakdown },
    abilityTriggers: { ...shot.abilityTriggers },
    events: shot.events.map((event) => ({ ...event })),
  };
}

export class BirdTelemetry {
  private completedShots: BirdShotTelemetry[] = [];
  private activeShot?: BirdShotTelemetry;
  private nextShotId = 1;

  reset(): void {
    this.completedShots = [];
    this.activeShot = undefined;
    this.nextShotId = 1;
  }

  beginShot(input: BeginShotInput): void {
    if (this.activeShot) {
      this.endShot({
        endedAt: input.startedAt,
        endScore: input.startScore,
        endReason: 'next-shot',
      });
    }
    this.activeShot = {
      shotId: this.nextShotId,
      level: input.level,
      birdId: input.birdId,
      startedAt: input.startedAt,
      endedAt: null,
      durationMs: null,
      launchVelocity: { ...input.launchVelocity },
      startScore: input.startScore,
      endScore: null,
      scoreDelta: 0,
      scoreBreakdown: { impact: 0, destruction: 0, ability: 0, completion: 0 },
      impacts: 0,
      damageDealt: 0,
      destroyedBlocks: 0,
      destroyedTargets: 0,
      precisionHits: 0,
      abilityTriggers: {},
      endReason: null,
      events: [],
    };
    this.nextShotId += 1;
  }

  recordImpact(input: ImpactInput): void {
    const shot = this.activeShot;
    if (!shot) return;
    const damage = Math.max(0, input.damageDealt);
    const score = Math.max(0, Math.round(input.score));
    shot.impacts += 1;
    shot.damageDealt += damage;
    shot.scoreBreakdown.impact += score;
    shot.events.push({
      atMs: Math.max(0, input.at - shot.startedAt),
      type: 'impact',
      source: input.source,
      kind: input.kind,
      material: input.material,
      damage,
      score,
      absorbed: input.absorbed,
      precision: input.precision,
    });
  }

  recordDestruction(input: DestructionInput): void {
    const shot = this.activeShot;
    if (!shot) return;
    const score = Math.max(0, Math.round(input.score));
    if (input.kind === 'target') shot.destroyedTargets += 1;
    else shot.destroyedBlocks += 1;
    shot.scoreBreakdown.destruction += score;
    shot.events.push({
      atMs: Math.max(0, input.at - shot.startedAt),
      type: 'destruction',
      kind: input.kind,
      material: input.material,
      score,
    });
  }

  recordAbility(input: AbilityInput): void {
    const shot = this.activeShot;
    if (!shot) return;
    const score = Math.max(0, Math.round(input.score ?? 0));
    shot.abilityTriggers[input.ability] = (shot.abilityTriggers[input.ability] ?? 0) + 1;
    if (input.ability === 'precision-strike') shot.precisionHits += 1;
    shot.scoreBreakdown.ability += score;
    shot.events.push({
      atMs: Math.max(0, input.at - shot.startedAt),
      type: 'ability',
      ability: input.ability,
      score,
    });
  }

  endShot(input: EndShotInput): BirdShotTelemetry | null {
    const shot = this.activeShot;
    if (!shot) return null;
    shot.endedAt = input.endedAt;
    shot.durationMs = Math.max(0, input.endedAt - shot.startedAt);
    shot.endScore = input.endScore;
    shot.scoreDelta = Math.max(0, input.endScore - shot.startScore);
    const trackedScore = shot.scoreBreakdown.impact + shot.scoreBreakdown.destruction + shot.scoreBreakdown.ability;
    shot.scoreBreakdown.completion = Math.max(0, shot.scoreDelta - trackedScore);
    shot.endReason = input.endReason;
    this.completedShots.push(shot);
    this.activeShot = undefined;
    return cloneShot(shot);
  }

  snapshot(currentScore?: number): Record<string, unknown> {
    const aggregate = Object.fromEntries(BIRD_IDS.map((birdId) => [birdId, {
      shots: 0,
      totalScore: 0,
      averageScorePerShot: 0,
      damageDealt: 0,
      destroyedBlocks: 0,
      destroyedTargets: 0,
      precisionHits: 0,
      abilityTriggers: 0,
    }])) as Record<BirdId, BirdAggregateTelemetry>;

    for (const shot of this.completedShots) {
      const bird = aggregate[shot.birdId];
      bird.shots += 1;
      bird.totalScore += shot.scoreDelta;
      bird.damageDealt += shot.damageDealt;
      bird.destroyedBlocks += shot.destroyedBlocks;
      bird.destroyedTargets += shot.destroyedTargets;
      bird.precisionHits += shot.precisionHits;
      bird.abilityTriggers += Object.values(shot.abilityTriggers).reduce((sum, count) => sum + Number(count), 0);
    }
    for (const bird of Object.values(aggregate)) {
      bird.averageScorePerShot = bird.shots > 0 ? Math.round(bird.totalScore / bird.shots) : 0;
      bird.damageDealt = Number(bird.damageDealt.toFixed(2));
    }

    const activeShot = this.activeShot ? cloneShot(this.activeShot) : null;
    if (activeShot && Number.isFinite(currentScore)) {
      activeShot.endScore = Number(currentScore);
      activeShot.scoreDelta = Math.max(0, Number(currentScore) - activeShot.startScore);
      const trackedScore = activeShot.scoreBreakdown.impact
        + activeShot.scoreBreakdown.destruction
        + activeShot.scoreBreakdown.ability;
      activeShot.scoreBreakdown.completion = Math.max(0, activeShot.scoreDelta - trackedScore);
    }

    return {
      version: '1.0',
      coverage: 'focused-per-shot',
      comparisonStatus: 'instrumented-not-run',
      runConfig: {
        engine: 'Phaser 3 + Matter.js',
        maxFlightMs: 11_000,
        inputSchema: {
          aim: { type: 'pointer-drag-release', maxDistance: 132 },
          quickFire: { type: 'button', timing: 'pressed' },
          birdOrder: { type: 'pre-mission sequence' },
        },
        visibleStateSchema: ['predicted_trajectory', 'bird_position', 'targets', 'materials', 'score', 'remaining_birds'],
        telemetryCoverage: {
          input: 'bird id and launch velocity per shot',
          scoring: 'impact, destruction, ability, and completion score',
          spawn: 'static level-authored targets; no runtime spawn RNG',
          death: 'not applicable; loss is remaining targets after ammo exhaustion',
        },
      },
      completedShots: this.completedShots.map(cloneShot),
      activeShot,
      aggregate,
      exploratoryRatio: null,
    };
  }
}
