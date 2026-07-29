import { getBirdSpec } from '../game/content/birds';
import { LEVELS } from '../game/content/levels';
import { gameBus, type HudPayload, type ResultPayload, type StarProgressPayload } from '../game/events';
import { getStarRequirements, type StarProgressStore, type StarRating } from '../game/progression/starProgress';
import type { AudioSynth } from './AudioSynth';

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
};

export class HudController {
  private readonly usesLegacyLoadoutEntry = import.meta.env.VITE_SITE_ENTRY === 'play';
  private readonly score = required<HTMLElement>('score-value');
  private readonly level = required<HTMLElement>('level-value');
  private readonly ammo = required<HTMLElement>('ammo-value');
  private readonly ammoLabel = required<HTMLElement>('ammo-label');
  private readonly hint = required<HTMLElement>('hint');
  private readonly hintText = required<HTMLElement>('hint-text');
  private readonly combo = required<HTMLElement>('combo-chip');
  private readonly overlay = required<HTMLElement>('result-overlay');
  private readonly resultKicker = required<HTMLElement>('result-kicker');
  private readonly resultTitle = required<HTMLElement>('result-title');
  private readonly resultCopy = required<HTMLElement>('result-copy');
  private readonly resultScore = required<HTMLElement>('result-score');
  private readonly resultCombo = required<HTMLElement>('result-combo');
  private readonly resultStarCount = required<HTMLElement>('result-star-count');
  private readonly resultStarPanel = required<HTMLElement>('result-star-panel');
  private readonly resultStars = required<HTMLElement>('result-stars');
  private readonly resultStarRecord = required<HTMLElement>('result-star-record');
  private readonly resultStarRequirements = required<HTMLElement>('result-star-requirements');
  private readonly resultStats = required<HTMLElement>('result-score').parentElement?.parentElement as HTMLElement;
  private readonly resultButton = required<HTMLButtonElement>('result-button');
  private readonly resultLoadoutButton = required<HTMLButtonElement>('result-loadout-button');
  private readonly soundButtons = [
    required<HTMLButtonElement>('sound-button'),
    required<HTMLButtonElement>('loadout-sound-button'),
  ];
  private readonly pauseButton = required<HTMLButtonElement>('pause-button');
  private overlayAction: 'next' | 'retry' | 'continue' | 'replay' = 'next';
  private comboTimer?: number;

  constructor(
    private readonly audio: AudioSynth,
    private readonly progress: StarProgressStore,
  ) {
    required<HTMLButtonElement>('fire-button').addEventListener('click', () => gameBus.emit('command:quick-fire'));
    required<HTMLButtonElement>('restart-button').addEventListener('click', () => gameBus.emit('command:restart'));
    this.pauseButton.addEventListener('click', () => gameBus.emit('command:pause'));
    this.soundButtons.forEach((button) => button.addEventListener('click', () => {
      this.audio.toggle();
      this.syncSoundButtons();
    }));
    this.resultButton.addEventListener('click', () => gameBus.emit(`command:${this.overlayAction}`));
    this.resultLoadoutButton.textContent = this.usesLegacyLoadoutEntry ? '返回整备' : '返回本章选关';
    this.resultLoadoutButton.addEventListener('click', () => {
      gameBus.emit(this.usesLegacyLoadoutEntry ? 'command:return-loadout' : 'command:return-site');
    });

    gameBus.on('hud:update', this.update, this);
    gameBus.on('hint:update', this.updateHint, this);
    gameBus.on('combo:show', this.showCombo, this);
    gameBus.on('result:show', this.showResult, this);
    gameBus.on('pause:changed', this.showPause, this);
    gameBus.on('overlay:hide', this.hideOverlay, this);
    gameBus.on('loadout:show', this.hideOverlay, this);
  }

  private syncSoundButtons(): void {
    const enabled = this.audio.enabled;
    this.soundButtons.forEach((button) => {
      const loadoutButton = button.id === 'loadout-sound-button';
      button.innerHTML = loadoutButton
        ? `<span aria-hidden="true">${enabled ? '♫' : '×'}</span> ${enabled ? '音效开' : '音效关'}`
        : (enabled ? '♫' : '×');
      button.setAttribute('aria-label', enabled ? '关闭音效' : '开启音效');
      button.classList.toggle('muted', !enabled);
    });
  }

  private update(payload: HudPayload): void {
    const bird = getBirdSpec(payload.birdId);
    this.score.textContent = payload.score.toString().padStart(6, '0');
    this.level.textContent = `${payload.level} / ${payload.totalLevels}`;
    this.ammoLabel.textContent = bird.name;
    this.ammo.dataset.birdId = bird.id;
    this.ammo.style.setProperty('--ammo-color', bird.color);
    this.ammo.style.setProperty('--ammo-dark', bird.darkColor);
    this.ammo.innerHTML = payload.remainingBirdQueue.map((birdId, index) => {
      const queuedBird = getBirdSpec(birdId);
      return `<span class="ammo-bird generated ${index === 0 ? 'next' : ''}" data-bird-id="${queuedBird.id}"
        style="--delay:${index * 45}ms;--ammo-color:${queuedBird.color};--ammo-dark:${queuedBird.darkColor}" aria-hidden="true">
        <img src="${queuedBird.assetPath}" alt="" />
      </span>`;
    }).join('');
    this.ammo.setAttribute('aria-label', `剩余 ${payload.shots} 枚怒羽`);
  }

  private updateHint(text: string, visible = true): void {
    this.hintText.textContent = text;
    this.hint.classList.toggle('hidden', !visible);
  }

  private showCombo(combo: number, points: number): void {
    window.clearTimeout(this.comboTimer);
    this.combo.textContent = combo > 1 ? `连锁 ×${combo}  +${points}` : `漂亮！ +${points}`;
    this.combo.classList.remove('show');
    void this.combo.offsetWidth;
    this.combo.classList.add('show');
    this.comboTimer = window.setTimeout(() => this.combo.classList.remove('show'), 1_300);
  }

  private showResult(payload: ResultPayload): void {
    const requirements = getStarRequirements(LEVELS[payload.levelIndex].shots);
    const progressUpdate = this.progress.record(payload.levelIndex, payload.stars);
    const progressPayload: StarProgressPayload = {
      levelIndex: payload.levelIndex,
      bestStars: progressUpdate.best,
    };
    gameBus.emit('progress:updated', progressPayload);

    this.overlayAction = payload.won ? (payload.finalLevel ? 'replay' : 'next') : 'retry';
    this.resultKicker.textContent = payload.won ? (payload.finalLevel ? '山谷重归安宁' : '阵地清除') : '还差一点';
    this.resultTitle.textContent = payload.won ? (payload.finalLevel ? '怒羽凯旋！' : '漂亮一击！') : '重新整队？';
    this.resultCopy.textContent = payload.won
      ? (payload.finalLevel ? '四十座堡垒全部瓦解，暮云山谷得救了。' : '果冻盗贼的堡垒已经瓦解。')
      : '试着瞄准支撑梁；蓝鸟、黑鸟和绿鸟的能力都会自动触发。';
    this.resultScore.textContent = payload.levelScore.toLocaleString('zh-CN');
    this.resultCombo.textContent = `×${payload.bestCombo}`;
    this.resultStarCount.textContent = `${payload.stars} / 3`;
    this.renderStars(this.resultStars, payload.stars, `本次 ${payload.stars} 星`);
    this.resultStarRecord.textContent = progressUpdate.improved
      ? `新纪录 · 本次 ${payload.stars} 星`
      : `本次 ${payload.stars} 星 · 历史最高 ${progressUpdate.best} 星`;
    this.resultStarRequirements.innerHTML = `
      <span><b>★</b>${requirements.oneStar}</span>
      <span><b>★★</b>${requirements.twoStars}</span>
      <span><b>★★★</b>${requirements.threeStars}</span>`;
    this.resultButton.innerHTML = payload.won
      ? (payload.finalLevel ? '再玩一轮 <span>↻</span>' : '下一关 <span>→</span>')
      : '再试一次 <span>↻</span>';
    this.resultStats.hidden = false;
    this.resultStarPanel.hidden = false;
    this.openOverlay();
  }

  private showPause(paused: boolean): void {
    this.pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    this.pauseButton.setAttribute('aria-label', paused ? '继续' : '暂停');
    if (!paused) {
      if (this.overlayAction === 'continue') this.hideOverlay();
      return;
    }
    this.overlayAction = 'continue';
    this.resultKicker.textContent = '战术暂停';
    this.resultTitle.textContent = '风停在半空';
    this.resultCopy.textContent = '喝口水，回来继续拆掉那座摇摇欲坠的堡垒。';
    this.resultStats.hidden = true;
    this.resultStarPanel.hidden = true;
    this.resultButton.innerHTML = '继续战斗 <span>▶</span>';
    this.openOverlay();
  }

  private renderStars(element: HTMLElement, stars: StarRating, label: string): void {
    element.setAttribute('aria-label', label);
    element.innerHTML = Array.from({ length: 3 }, (_, index) => {
      const active = index < stars;
      return `<i class="${active ? 'active' : ''}" aria-hidden="true">${active ? '★' : '☆'}</i>`;
    }).join('');
  }

  private openOverlay(): void {
    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => this.resultButton.focus(), 80);
  }

  private hideOverlay(): void {
    this.overlay.classList.remove('visible');
    this.overlay.setAttribute('aria-hidden', 'true');
  }
}
