import type { SoundCue } from '../game/events';

export class AudioSynth {
  enabled = true;
  private context?: AudioContext;

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  play(cue: SoundCue): void {
    if (!this.enabled) return;
    const context = this.getContext();
    if (!context) return;

    const presets: Record<SoundCue, [number, number, number, OscillatorType]> = {
      pull: [180, 125, 0.05, 'sine'],
      launch: [260, 520, 0.12, 'triangle'],
      boost: [420, 920, 0.16, 'sawtooth'],
      split: [360, 1_080, 0.18, 'triangle'],
      phase: [760, 280, 0.2, 'sine'],
      gunshot: [150, 48, 0.14, 'square'],
      explosion: [110, 32, 0.24, 'sawtooth'],
      impact: [120, 70, 0.07, 'square'],
      'impact-scarlet': [170, 82, 0.08, 'square'],
      'impact-iron': [92, 34, 0.14, 'square'],
      'impact-gale': [510, 190, 0.09, 'triangle'],
      'impact-verdant': [390, 145, 0.1, 'triangle'],
      break: [240, 95, 0.12, 'square'],
      target: [620, 980, 0.2, 'triangle'],
      win: [520, 1_040, 0.42, 'triangle'],
      lose: [280, 110, 0.36, 'sine'],
    };
    const [from, to, duration, type] = presets[cue];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), context.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(cue.startsWith('impact') ? 0.1 : 0.16, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  private getContext(): AudioContext | undefined {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      return undefined;
    }
  }
}
