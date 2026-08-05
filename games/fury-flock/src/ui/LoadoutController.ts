import { BIRD_RECOMMENDATIONS, BIRD_SPECS, getBirdSpec } from '../game/content/birds';
import { getLevelBackground } from '../game/content/backgrounds';
import { LEVELS, type LevelSpec, type Material } from '../game/content/levels';
import { getTargetArt } from '../game/content/targets';
import { gameBus, type StartMissionPayload } from '../game/events';
import { getStarRequirements, type StarProgressStore, type StarRating } from '../game/progression/starProgress';
import { LoadoutState } from '../game/simulation/LoadoutState';

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
};

const MATERIAL_LABELS: Record<Material, string> = {
  wood: '木材',
  stone: '石材',
  glass: '玻璃',
};

export class LoadoutController {
  private readonly state = new LoadoutState(LEVELS.map((level) => level.shots));
  private readonly screen = required<HTMLElement>('loadout-screen');
  private readonly levelRoute = required<HTMLElement>('level-route');
  private readonly ammoLoadout = required<HTMLElement>('ammo-loadout');
  private readonly birdOptions = required<HTMLElement>('bird-options');
  private readonly levelNumber = required<HTMLElement>('selected-level-number');
  private readonly levelName = required<HTMLElement>('selected-level-name');
  private readonly levelSubtitle = required<HTMLElement>('selected-level-subtitle');
  private readonly levelMeta = required<HTMLElement>('selected-level-meta');
  private readonly levelMaterials = required<HTMLElement>('selected-level-materials');
  private readonly levelBestStars = required<HTMLElement>('selected-level-best-stars');
  private readonly levelStarRequirements = required<HTMLElement>('selected-level-star-requirements');
  private readonly fortressPreview = required<HTMLElement>('fortress-preview');
  private readonly fortressMiniature = required<HTMLElement>('fortress-miniature');
  private readonly birdAvatar = required<HTMLElement>('selected-bird-avatar');
  private readonly birdRole = required<HTMLElement>('selected-bird-role');
  private readonly birdName = required<HTMLElement>('selected-bird-name');
  private readonly birdDescription = required<HTMLElement>('selected-bird-description');
  private readonly birdPower = required<HTMLElement>('bird-power');
  private readonly birdArc = required<HTMLElement>('bird-arc');
  private readonly birdControl = required<HTMLElement>('bird-control');
  private readonly recommendation = required<HTMLElement>('bird-recommendation');
  private readonly startButton = required<HTMLButtonElement>('mission-start-button');
  private visible = false;

  constructor(private readonly progress: StarProgressStore) {
    this.visible = import.meta.env.VITE_SITE_ENTRY === 'play'
      && (!window.location.hash || window.location.hash === '#play');
    this.renderOptions();
    this.syncView();
    this.screen.classList.toggle('visible', this.visible);
    this.screen.setAttribute('aria-hidden', String(!this.visible));

    this.levelRoute.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-level-index]');
      if (!button || !this.state.selectLevel(Number(button.dataset.levelIndex))) return;
      this.syncView();
    });
    this.ammoLoadout.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-ammo-slot]');
      if (!button || !this.state.selectSlot(Number(button.dataset.ammoSlot))) return;
      this.syncView();
    });
    this.birdOptions.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-bird-id]');
      if (!button || !this.state.assignBird(button.dataset.birdId ?? '')) return;
      this.syncView();
    });
    this.startButton.addEventListener('click', this.startMission);
    document.addEventListener('keydown', this.handleKeyDown);
    gameBus.on('loadout:show', this.show, this);
    gameBus.on('loadout:hide', this.hide, this);
    gameBus.on('loadout:sync', this.syncSelection, this);
    gameBus.on('progress:updated', this.syncProgress, this);
  }

  getDebugState(): Record<string, unknown> {
    return {
      phase: 'loadout',
      loadoutOpen: this.visible,
      selectedLevelIndex: this.state.selectedLevelIndex,
      selectedSlotIndex: this.state.selectedSlotIndex,
      selectedBirdId: this.state.selectedBirdId,
      birdQueue: this.state.getSelectedQueue(),
      bird: null,
    };
  }

  private renderOptions(): void {
    this.levelRoute.innerHTML = LEVELS.map((level, index) => {
      const bestStars = this.progress.getBest(index);
      return `
        <button class="level-node" type="button" data-level-index="${index}"
          aria-label="选择第${index + 1}关 ${level.name}，历史最高 ${bestStars} 星" aria-pressed="false">
          <span>${String(index + 1).padStart(2, '0')}</span><small>${level.name}</small>
          <em class="level-stars" data-level-stars aria-hidden="true">${this.starGlyphs(bestStars)}</em>
        </button>`;
    }).join('');

    this.birdOptions.innerHTML = BIRD_SPECS.map((bird) => `
      <button class="bird-option" type="button" data-bird-id="${bird.id}"
        aria-label="选择${bird.name}" aria-pressed="false"
        style="--bird-color:${bird.color};--bird-dark:${bird.darkColor}">
        <span class="bird-avatar generated" aria-hidden="true">
          <img src="${bird.assetPath}" alt="" loading="eager" />
        </span>
        <span><strong>${bird.name}</strong><small>${bird.role}</small></span>
      </button>
    `).join('');
  }

  private syncView(): void {
    const level = LEVELS[this.state.selectedLevelIndex];
    const bird = getBirdSpec(this.state.selectedBirdId);
    const recommended = getBirdSpec(BIRD_RECOMMENDATIONS[this.state.selectedLevelIndex]);
    const materials = [...new Set(level.blocks.map((block) => block.material))];

    this.levelRoute.querySelectorAll<HTMLButtonElement>('[data-level-index]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.levelIndex) === this.state.selectedLevelIndex));
    });
    this.renderAmmoLoadout();
    this.birdOptions.querySelectorAll<HTMLButtonElement>('[data-bird-id]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.birdId === this.state.selectedBirdId));
    });

    this.levelNumber.innerHTML = `第${this.state.selectedLevelIndex + 1}关 <span class="difficulty" aria-label="难度 ${level.difficulty} 羽">
      <span>难度</span><b class="difficulty-feathers" aria-hidden="true">${Array.from({ length: 5 }, (_, index) => `<i class="${index < level.difficulty ? 'active' : ''}"></i>`).join('')}</b>
    </span>`;
    this.levelName.textContent = level.name;
    this.levelSubtitle.textContent = level.subtitle;
    this.levelMeta.innerHTML = `<span>${level.targets.length} 个目标</span><span>${level.shots} 枚怒羽</span>`;
    this.levelMaterials.innerHTML = materials.map((material) => `<span data-material="${material}"><i aria-hidden="true"></i>${MATERIAL_LABELS[material]}</span>`).join('');
    this.syncSelectedLevelStars();
    this.renderFortressPreview(level);
    this.birdRole.textContent = `${bird.role} · ${bird.abilityName}`;
    this.birdName.textContent = bird.name;
    this.birdDescription.textContent = bird.description;
    this.birdAvatar.dataset.birdId = bird.id;
    this.birdAvatar.style.setProperty('--bird-color', bird.color);
    this.birdAvatar.style.setProperty('--bird-dark', bird.darkColor);
    const selectedBirdImage = this.birdAvatar.querySelector<HTMLImageElement>('img');
    if (selectedBirdImage) selectedBirdImage.src = bird.assetPath;
    this.renderPips(this.birdPower, bird.stats.power);
    this.renderPips(this.birdArc, bird.stats.arc);
    this.renderPips(this.birdControl, bird.stats.control);
    this.recommendation.innerHTML = `<span>本关推荐</span><strong>${recommended.name}</strong><small>${recommended.role}</small>`;
    this.startButton.innerHTML = `开始第${this.state.selectedLevelIndex + 1}关 <span>➤</span>`;
  }

  private syncSelectedLevelStars(): void {
    const level = LEVELS[this.state.selectedLevelIndex];
    const bestStars = this.progress.getBest(this.state.selectedLevelIndex);
    const requirements = getStarRequirements(level.shots);
    this.levelBestStars.textContent = `${this.starGlyphs(bestStars)} 历史最高`;
    this.levelBestStars.setAttribute('aria-label', `历史最高 ${bestStars} 星`);
    this.levelStarRequirements.innerHTML = `
      <span><b>★</b>${requirements.oneStar}</span>
      <span><b>★★</b>${requirements.twoStars}</span>
      <span><b>★★★</b>${requirements.threeStars}</span>`;
  }

  private readonly syncProgress = (): void => {
    this.levelRoute.querySelectorAll<HTMLButtonElement>('[data-level-index]').forEach((button) => {
      const levelIndex = Number(button.dataset.levelIndex);
      const level = LEVELS[levelIndex];
      const bestStars = this.progress.getBest(levelIndex);
      const stars = button.querySelector<HTMLElement>('[data-level-stars]');
      if (stars) stars.textContent = this.starGlyphs(bestStars);
      button.setAttribute('aria-label', `选择第${levelIndex + 1}关 ${level.name}，历史最高 ${bestStars} 星`);
    });
    this.syncSelectedLevelStars();
  };

  private starGlyphs(stars: StarRating): string {
    return `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  }

  private renderAmmoLoadout(): void {
    this.ammoLoadout.innerHTML = this.state.birdQueue.map((birdId, index) => {
      const bird = getBirdSpec(birdId);
      return `<button class="ammo-slot" type="button" data-ammo-slot="${index}" data-bird-id="${bird.id}"
        aria-label="第${index + 1}发 ${bird.name}" aria-pressed="${index === this.state.selectedSlotIndex}"
        style="--bird-color:${bird.color};--bird-dark:${bird.darkColor}">
        <span>${index + 1}</span><img src="${bird.assetPath}" alt="" /><small>${bird.name}</small>
      </button>`;
    }).join('');
  }

  private renderPips(element: HTMLElement, value: number): void {
    element.innerHTML = Array.from({ length: 5 }, (_, index) => `<i class="${index < value ? 'active' : ''}"></i>`).join('');
  }

  private renderFortressPreview(level: LevelSpec): void {
    const background = getLevelBackground(this.state.selectedLevelIndex);
    const platforms = level.platforms ?? [];
    const rectangles = [
      ...platforms.map((platform) => ({ ...platform, angle: 0 })),
      ...level.blocks.map((block) => ({ ...block, angle: block.angle ?? 0 })),
    ];
    const bounds = [
      ...rectangles.map((item) => ({
        left: item.x - item.width / 2,
        right: item.x + item.width / 2,
        top: item.y - item.height / 2,
        bottom: item.y + item.height / 2,
      })),
      ...level.targets.map((target) => {
        const radius = 30 * (target.scale ?? 1);
        return { left: target.x - radius, right: target.x + radius, top: target.y - radius, bottom: target.y + radius };
      }),
    ];
    const minX = Math.min(...bounds.map((item) => item.left));
    const maxX = Math.max(...bounds.map((item) => item.right));
    const minY = Math.min(...bounds.map((item) => item.top));
    const maxY = Math.max(...bounds.map((item) => item.bottom));
    const scale = Math.min(92 / Math.max(1, maxX - minX), 90 / Math.max(1, maxY - minY));
    const width = (maxX - minX) * scale;
    const height = (maxY - minY) * scale;
    const offsetX = (100 - width) / 2;
    const offsetY = Math.max(3, 96 - height);
    const styleRect = (x: number, y: number, itemWidth: number, itemHeight: number, angle = 0): string => [
      `left:${offsetX + (x - itemWidth / 2 - minX) * scale}%`,
      `top:${offsetY + (y - itemHeight / 2 - minY) * scale}%`,
      `width:${Math.max(1.8, itemWidth * scale)}%`,
      `height:${Math.max(1.8, itemHeight * scale)}%`,
      `transform:rotate(${angle}rad)`,
    ].join(';');

    const platformMarkup = platforms.map((platform) =>
      `<span class="fortress-platform" style="${styleRect(platform.x, platform.y, platform.width, platform.height)}"></span>`,
    ).join('');
    const blockMarkup = level.blocks.map((block) =>
      `<span class="fortress-block" data-material="${block.material}" style="${styleRect(block.x, block.y, block.width, block.height, block.angle)}"></span>`,
    ).join('');
    const targetMarkup = level.targets.map((target) => {
      const targetArt = getTargetArt({ armored: target.armored, gunner: target.gunner });
      const size = Math.max(5.5, 54 * (target.scale ?? 1) * scale);
      const left = offsetX + (target.x - minX) * scale - size / 2;
      const top = offsetY + (target.y - minY) * scale - size / 2;
      return `<span class="fortress-target generated" data-armored="${Boolean(target.armored)}" data-gunner="${Boolean(target.gunner)}"
        style="left:${left}%;top:${top}%;width:${size}%;height:${size}%">
        <img src="${targetArt.assetPath}" alt="" />
      </span>`;
    }).join('');

    this.fortressPreview.dataset.previewLevel = String(this.state.selectedLevelIndex);
    this.fortressPreview.classList.add('has-level-background');
    this.fortressPreview.style.backgroundImage = [
      'linear-gradient(rgba(23, 19, 42, 0.14), rgba(23, 19, 42, 0.34))',
      `url("${background.assetPath}")`,
    ].join(', ');
    this.fortressMiniature.innerHTML = platformMarkup + blockMarkup + targetMarkup;
  }

  private readonly startMission = (): void => {
    const payload: StartMissionPayload = {
      levelIndex: this.state.selectedLevelIndex,
      birdQueue: this.state.getSelectedQueue(),
    };
    gameBus.emit('command:start-mission', payload);
  };

  private readonly show = (): void => {
    this.visible = true;
    this.syncView();
    this.screen.classList.add('visible');
    this.screen.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => this.startButton.focus(), 100);
  };

  private readonly hide = (): void => {
    this.visible = false;
    this.screen.classList.remove('visible');
    this.screen.setAttribute('aria-hidden', 'true');
  };

  private readonly syncSelection = (payload: StartMissionPayload): void => {
    this.state.selectLevel(payload.levelIndex);
    this.state.syncQueue(payload.birdQueue);
    if (this.visible) this.syncView();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.visible) return;
    if (/^[1-5]$/.test(event.key)) {
      if (this.state.selectSlot(Number(event.key) - 1)) this.syncView();
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const next = (this.state.selectedLevelIndex + direction + LEVELS.length) % LEVELS.length;
      this.state.selectLevel(next);
      this.syncView();
      event.preventDefault();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      this.state.cycleSelectedBird(direction);
      this.syncView();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      this.startMission();
      event.preventDefault();
    }
  };
}
