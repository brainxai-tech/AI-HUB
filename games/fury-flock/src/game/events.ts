import type { BirdId, BirdImpactCue } from './content/birds';
import type { StarRating } from './progression/starProgress';

type EventCallback = (...args: any[]) => void;

interface EventListener {
  callback: EventCallback;
  context?: unknown;
  once: boolean;
}

class GameEventBus {
  private readonly listeners = new Map<string, EventListener[]>();

  on<TArgs extends any[]>(event: string, callback: (...args: TArgs) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push({ callback: callback as EventCallback, context, once: false });
    this.listeners.set(event, listeners);
    return this;
  }

  once<TArgs extends any[]>(event: string, callback: (...args: TArgs) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push({ callback: callback as EventCallback, context, once: true });
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, callback?: EventCallback, context?: unknown): this {
    if (!callback) {
      this.listeners.delete(event);
      return this;
    }
    const listeners = this.listeners.get(event) ?? [];
    const remaining = listeners.filter((listener) => listener.callback !== callback
      || (context !== undefined && listener.context !== context));
    if (remaining.length > 0) this.listeners.set(event, remaining);
    else this.listeners.delete(event);
    return this;
  }

  emit<TArgs extends any[]>(event: string, ...args: TArgs): boolean {
    const listeners = [...(this.listeners.get(event) ?? [])];
    if (listeners.length === 0) return false;
    for (const listener of listeners) {
      if (listener.once) this.removeListener(event, listener);
      listener.callback.apply(listener.context, args);
    }
    return true;
  }

  private removeListener(event: string, listener: EventListener): void {
    const listeners = this.listeners.get(event) ?? [];
    const remaining = listeners.filter((candidate) => candidate !== listener);
    if (remaining.length > 0) this.listeners.set(event, remaining);
    else this.listeners.delete(event);
  }
}

export const gameBus = new GameEventBus();

export type SoundCue = 'pull' | 'launch' | 'boost' | 'split' | 'phase' | 'gunshot' | 'explosion' | 'impact' | BirdImpactCue | 'break' | 'target' | 'win' | 'lose';

export interface HudPayload {
  level: number;
  totalLevels: number;
  score: number;
  shots: number;
  birdId: BirdId;
  remainingBirdQueue: BirdId[];
  status: 'playing' | 'won' | 'lost';
}

export interface StartMissionPayload {
  levelIndex: number;
  birdQueue: BirdId[];
}

export interface ResultPayload {
  levelIndex: number;
  won: boolean;
  finalLevel: boolean;
  levelScore: number;
  bestCombo: number;
  shotsRemaining: number;
  stars: StarRating;
}

export interface StarProgressPayload {
  levelIndex: number;
  bestStars: StarRating;
}
