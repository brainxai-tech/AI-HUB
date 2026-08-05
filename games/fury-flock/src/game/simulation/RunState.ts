export type RunStatus = 'playing' | 'won' | 'lost';

export interface DestructionScore {
  points: number;
  combo: number;
  targetsRemaining: number;
}

const COMBO_WINDOW_MS = 2_200;
const MAX_COMBO = 5;

export class RunState {
  levelIndex = 0;
  score = 0;
  levelScore = 0;
  scoreAtLevelStart = 0;
  shotsRemaining = 0;
  targetsRemaining = 0;
  status: RunStatus = 'playing';
  combo = 1;
  bestCombo = 1;

  private lastDestructionAt = Number.NEGATIVE_INFINITY;
  private resultResolved = false;

  constructor(initialScore = 0) {
    this.score = initialScore;
    this.scoreAtLevelStart = initialScore;
  }

  startLevel(levelIndex: number, shots: number, targets: number): void {
    this.levelIndex = levelIndex;
    this.scoreAtLevelStart = this.score;
    this.levelScore = 0;
    this.shotsRemaining = shots;
    this.targetsRemaining = targets;
    this.status = 'playing';
    this.combo = 1;
    this.bestCombo = 1;
    this.lastDestructionAt = Number.NEGATIVE_INFINITY;
    this.resultResolved = false;
  }

  launch(): boolean {
    if (this.status !== 'playing' || this.shotsRemaining <= 0) return false;
    this.shotsRemaining -= 1;
    return true;
  }

  addImpactPoints(points: number): void {
    if (this.status !== 'playing' || points <= 0) return;
    const rounded = Math.round(points);
    this.score += rounded;
    this.levelScore += rounded;
  }

  registerDestruction(basePoints: number, target: boolean, now: number): DestructionScore {
    if (this.status !== 'playing') {
      return { points: 0, combo: this.combo, targetsRemaining: this.targetsRemaining };
    }

    this.combo = now - this.lastDestructionAt <= COMBO_WINDOW_MS
      ? Math.min(MAX_COMBO, this.combo + 1)
      : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastDestructionAt = now;

    const points = Math.round(basePoints * this.combo);
    this.score += points;
    this.levelScore += points;
    if (target) this.targetsRemaining = Math.max(0, this.targetsRemaining - 1);

    return { points, combo: this.combo, targetsRemaining: this.targetsRemaining };
  }

  resolveTurn(): RunStatus {
    if (this.resultResolved) return this.status;

    if (this.targetsRemaining === 0) {
      this.status = 'won';
      const ammoBonus = this.shotsRemaining * 2_500;
      this.score += ammoBonus;
      this.levelScore += ammoBonus;
      this.resultResolved = true;
    } else if (this.shotsRemaining === 0) {
      this.status = 'lost';
      this.resultResolved = true;
    }

    return this.status;
  }

  retryScore(): number {
    return this.scoreAtLevelStart;
  }
}
