import {
  BIRD_RECOMMENDATIONS,
  BIRD_SPECS,
  FUTURE_BIRD_SPECS,
  getBirdSpec,
  type BirdCodexSpec,
} from '../game/content/birds';
import { getLevelBackground } from '../game/content/backgrounds';
import { FIRST_CHAPTER } from '../game/content/chapters';
import { LEVELS } from '../game/content/levels';
import { TARGET_PROFILES } from '../game/content/targets';
import { gameBus, type StartMissionPayload } from '../game/events';
import { getStarRequirements, type StarProgressStore, type StarRating } from '../game/progression/starProgress';
import { LoadoutState } from '../game/simulation/LoadoutState';

type SitePageId = 'home' | 'mission' | 'roster';

const SITE_PAGES: SitePageId[] = ['home', 'mission', 'roster'];

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing site element #${id}`);
  return element as T;
};

const resolvePage = (hash: string): SitePageId | 'play' => {
  const route = hash.replace(/^#/, '');
  if (route === 'play') return 'play';
  return SITE_PAGES.includes(route as SitePageId) ? route as SitePageId : 'home';
};

export class SitePortalController {
  private readonly state = new LoadoutState(LEVELS.map((level) => level.shots));
  private readonly portal = required<HTMLElement>('site-portal');
  private readonly app = required<HTMLElement>('app');
  private readonly returnButton = required<HTMLButtonElement>('site-return-button');
  private readonly missionPage = required<HTMLElement>('site-mission-title').closest<HTMLElement>('[data-site-page="mission"]')!;
  private readonly chapterSelect = required<HTMLElement>('site-chapter-select');
  private readonly chapterCard = required<HTMLButtonElement>('site-chapter-card');
  private readonly chapterStarTotal = required<HTMLElement>('site-chapter-star-total');
  private readonly chapterBackButton = required<HTMLButtonElement>('site-chapter-back-button');
  private readonly planner = required<HTMLElement>('site-mission-planner');
  private readonly levelRoute = required<HTMLElement>('site-level-route');
  private readonly ammoLoadout = required<HTMLElement>('site-ammo-loadout');
  private readonly birdOptions = required<HTMLElement>('site-bird-options');
  private readonly levelPreview = required<HTMLElement>('site-planner-preview');
  private readonly levelNumber = required<HTMLElement>('site-planner-level-number');
  private readonly levelName = required<HTMLElement>('site-planner-title');
  private readonly levelSubtitle = required<HTMLElement>('site-planner-level-subtitle');
  private readonly levelMeta = required<HTMLElement>('site-planner-level-meta');
  private readonly levelBestStars = required<HTMLElement>('site-planner-best-stars');
  private readonly levelStarRequirements = required<HTMLElement>('site-planner-star-requirements');
  private readonly startButton = required<HTMLButtonElement>('site-planner-start-button');
  private readonly birdCodex = required<HTMLElement>('site-bird-codex');
  private readonly futureBirdCodex = required<HTMLElement>('site-future-bird-codex');
  private readonly pigCodex = required<HTMLElement>('site-pig-codex');
  private readonly pages = [...document.querySelectorAll<HTMLElement>('[data-site-page]')];
  private readonly navigation = [...document.querySelectorAll<HTMLButtonElement>('[data-site-target]')];
  private readonly plannerButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-site-planner]')];
  private readonly enterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-enter-game]')];

  constructor(private readonly progress: StarProgressStore) {
    this.renderChapter();
    this.renderPlannerOptions();
    this.renderCodex();
    this.syncPlanner();
    this.syncProgress();

    this.navigation.forEach((button) => button.addEventListener('click', () => {
      const page = (button.dataset.siteTarget ?? 'home') as SitePageId;
      if (page === 'mission') this.setChapterOpen(false, false);
      this.showPage(page, true, true);
    }));
    this.plannerButtons.forEach((button) => button.addEventListener('click', this.openChapterSelect));
    this.chapterCard.addEventListener('click', this.openSelectedChapter);
    this.chapterBackButton.addEventListener('click', this.returnToChapterSelect);
    this.enterButtons.forEach((button) => button.addEventListener('click', this.launchMission));
    this.levelRoute.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-site-level-index]');
      if (!button || !this.state.selectLevel(Number(button.dataset.siteLevelIndex))) return;
      this.syncPlanner();
    });
    this.ammoLoadout.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-site-ammo-slot]');
      if (!button || !this.state.selectSlot(Number(button.dataset.siteAmmoSlot))) return;
      this.syncPlanner();
    });
    this.birdOptions.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-site-bird-id]');
      if (!button || !this.state.assignBird(button.dataset.siteBirdId ?? '')) return;
      this.syncPlanner();
    });
    this.returnButton.addEventListener('click', () => gameBus.emit('command:return-site'));
    gameBus.on('site:show', this.returnToSite, this);
    gameBus.on('loadout:sync', this.syncSelection, this);
    gameBus.on('progress:updated', this.syncProgress, this);
    window.addEventListener('hashchange', this.syncFromHash);
    this.syncFromHash();
  }

  private renderChapter(): void {
    const cover = this.chapterCard.querySelector<HTMLElement>('.site-chapter-cover');
    const background = getLevelBackground(FIRST_CHAPTER.coverLevelIndex);
    if (cover) {
      cover.style.backgroundImage = [
        'linear-gradient(120deg, rgba(32, 27, 43, 0.08), rgba(53, 34, 42, 0.48))',
        `url("${background.assetPath}")`,
      ].join(', ');
    }
  }

  private renderPlannerOptions(): void {
    this.levelRoute.innerHTML = FIRST_CHAPTER.acts.map((act, actIndex) => {
      const levelButtons = FIRST_CHAPTER.levelIndexes
        .filter((levelIndex) => levelIndex >= act.startLevelIndex && levelIndex <= act.endLevelIndex)
        .map((levelIndex) => {
          const level = LEVELS[levelIndex];
          const bestStars = this.progress.getBest(levelIndex);
          return `
            <button class="site-level-node" type="button" data-site-level-index="${levelIndex}"
              aria-label="选择第${levelIndex + 1}关 ${level.name}，${level.subtitle}，历史最高 ${bestStars} 星" aria-pressed="false">
              <span>${String(levelIndex + 1).padStart(2, '0')}</span><small>${level.name}</small>
              <em class="site-level-stars" data-site-level-stars aria-hidden="true">${this.starGlyphs(bestStars)}</em>
            </button>`;
        }).join('');

      return `
        <section class="site-level-act" aria-labelledby="site-level-act-${actIndex + 1}">
          <div class="site-level-act-heading">
            <span>第${actIndex + 1}幕</span>
            <strong id="site-level-act-${actIndex + 1}">${act.name}</strong>
            <small>${act.subtitle}</small>
          </div>
          <div class="site-level-act-grid">${levelButtons}</div>
        </section>`;
    }).join('');

    this.birdOptions.innerHTML = BIRD_SPECS.map((bird) => `
      <button class="site-bird-option" type="button" data-site-bird-id="${bird.id}"
        aria-label="装填${bird.name}" aria-pressed="false"
        style="--bird-color:${bird.color};--bird-dark:${bird.darkColor}">
        <img src="${bird.assetPath}" alt="" loading="eager" />
        <span><strong>${bird.name}</strong><small>${bird.role}</small></span>
      </button>
    `).join('');
  }

  private renderCodex(): void {
    this.birdCodex.innerHTML = BIRD_SPECS.map((bird) => this.birdProfileMarkup(bird)).join('');
    this.futureBirdCodex.innerHTML = FUTURE_BIRD_SPECS
      .map((bird) => this.birdProfileMarkup(bird, true))
      .join('');

    this.pigCodex.innerHTML = TARGET_PROFILES.map((target) => `
      <article class="site-combatant-profile site-pig-profile" style="--profile-color:${target.color}">
        <div class="site-profile-portrait">
          <span class="site-profile-index">${target.role}</span>
          <img src="${target.assetPath}" alt="${target.name}" loading="lazy" />
        </div>
        <div class="site-profile-copy">
          <p class="site-profile-faction">苔鼻军团</p>
          <h3>${target.name}</h3>
          <dl class="site-profile-fields">
            <div data-profile-field="stats"><dt>属性</dt><dd>${target.stats}</dd></div>
            <div data-profile-field="trait"><dt>特点</dt><dd>${target.trait}</dd></div>
            <div data-profile-field="skill"><dt>技能</dt><dd><strong>${target.skillName}</strong><span>${target.skillDescription}</span></dd></div>
          </dl>
        </div>
      </article>
    `).join('');
  }

  private birdProfileMarkup(bird: BirdCodexSpec, locked = false): string {
    const speed = bird.launchMultiplier > 1.05 ? '高速' : bird.launchMultiplier < 0.95 ? '低速' : '标准';
    const weight = bird.density > 0.0013 ? '重型' : bird.density < 0.0008 ? '轻型' : '中型';
    const unlockRequirement = locked ? bird.unlockRequirement ?? '第二章进度解锁' : '';
    return `
      <article class="site-combatant-profile site-bird-profile ${bird.id}${locked ? ' is-locked' : ''}"
        style="--profile-color:${bird.color};--profile-dark:${bird.darkColor}"
        ${locked ? 'data-release-chapter="2"' : ''}>
        <div class="site-profile-portrait">
          <span class="site-profile-index">${bird.role}</span>
          ${locked ? '<span class="site-profile-lock"><b aria-hidden="true">◆</b> 第二章解锁</span>' : ''}
          <img src="${bird.assetPath}" alt="${bird.name}" loading="lazy" />
        </div>
        <div class="site-profile-copy">
          <p class="site-profile-faction">${locked ? '第二章增援 · 未解锁' : '怒羽小队'}</p>
          <h3>${bird.name}</h3>
          <dl class="site-profile-fields">
            <div data-profile-field="stats"><dt>属性</dt><dd>破坏力 ${bird.stats.power} / 5 · 弹道 ${bird.stats.arc} / 5 · 操控 ${bird.stats.control} / 5<br />${speed} · ${weight} · 撞击倍率 ${bird.impactMultiplier.toFixed(2)}</dd></div>
            <div data-profile-field="trait"><dt>特点</dt><dd>${bird.description}</dd></div>
            <div data-profile-field="skill"><dt>技能</dt><dd><strong>${bird.abilityName}</strong><span>${bird.abilityHint}</span></dd></div>
            ${locked ? `<div data-profile-field="unlock"><dt>解锁</dt><dd><strong>${unlockRequirement}</strong><span>第二章发布后生效</span></dd></div>` : ''}
          </dl>
        </div>
      </article>`;
  }

  private syncPlanner(): void {
    const level = LEVELS[this.state.selectedLevelIndex];
    const recommendedBirdId = BIRD_RECOMMENDATIONS[this.state.selectedLevelIndex];
    const background = getLevelBackground(this.state.selectedLevelIndex);

    this.levelRoute.querySelectorAll<HTMLButtonElement>('[data-site-level-index]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.siteLevelIndex) === this.state.selectedLevelIndex));
    });
    this.renderAmmoLoadout();
    this.birdOptions.querySelectorAll<HTMLButtonElement>('[data-site-bird-id]').forEach((button) => {
      const birdId = button.dataset.siteBirdId;
      button.setAttribute('aria-pressed', String(birdId === this.state.selectedBirdId));
      button.toggleAttribute('data-recommended', birdId === recommendedBirdId);
    });

    this.levelPreview.style.backgroundImage = [
      'linear-gradient(rgba(39, 34, 45, 0.08), rgba(39, 34, 45, 0.28))',
      `url("${background.assetPath}")`,
    ].join(', ');
    this.levelNumber.textContent = `第${this.state.selectedLevelIndex + 1}关`;
    this.levelName.textContent = level.name;
    this.levelSubtitle.textContent = level.subtitle;
    this.levelMeta.textContent = `${level.targets.length} 个目标 / ${level.shots} 枚怒羽 / 难度 ${level.difficulty}`;
    this.syncSelectedLevelStars();
    this.startButton.innerHTML = `开始第${this.state.selectedLevelIndex + 1}关 <span aria-hidden="true">➤</span>`;
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
    this.chapterStarTotal.textContent = `${this.progress.getTotal()}/${LEVELS.length * 3}`;
    this.levelRoute.querySelectorAll<HTMLButtonElement>('[data-site-level-index]').forEach((button) => {
      const levelIndex = Number(button.dataset.siteLevelIndex);
      const level = LEVELS[levelIndex];
      const bestStars = this.progress.getBest(levelIndex);
      const stars = button.querySelector<HTMLElement>('[data-site-level-stars]');
      if (stars) stars.textContent = this.starGlyphs(bestStars);
      button.setAttribute('aria-label', `选择第${levelIndex + 1}关 ${level.name}，${level.subtitle}，历史最高 ${bestStars} 星`);
    });
    this.syncSelectedLevelStars();
  };

  private starGlyphs(stars: StarRating): string {
    return `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  }

  private renderAmmoLoadout(): void {
    this.ammoLoadout.innerHTML = this.state.birdQueue.map((birdId, index) => {
      const bird = getBirdSpec(birdId);
      return `<button class="site-ammo-slot" type="button" data-site-ammo-slot="${index}" data-bird-id="${bird.id}"
        aria-label="第${index + 1}发 ${bird.name}" aria-pressed="${index === this.state.selectedSlotIndex}"
        style="--bird-color:${bird.color};--bird-dark:${bird.darkColor}">
        <span>${index + 1}</span><img src="${bird.assetPath}" alt="" /><small>${bird.name}</small>
      </button>`;
    }).join('');
  }

  private readonly syncFromHash = (): void => {
    const route = !window.location.hash && import.meta.env.VITE_SITE_ENTRY === 'play'
      ? 'play'
      : resolvePage(window.location.hash);
    if (route === 'play' && import.meta.env.VITE_SITE_ENTRY === 'play') {
      this.enterLegacyLoadout(false);
      return;
    }
    if (route !== 'play' && this.portal.classList.contains('is-hidden')) {
      gameBus.emit('command:return-site');
      return;
    }
    if (route === 'play') history.replaceState(null, '', '#mission');
    const page = route === 'play' ? 'mission' : route;
    if (page === 'mission') this.setChapterOpen(false, false);
    this.showPage(page, false, false);
  };

  private showPage(page: SitePageId, updateHash: boolean, moveFocus: boolean): void {
    this.portal.classList.remove('is-hidden');
    this.portal.setAttribute('aria-hidden', 'false');
    this.app.setAttribute('aria-hidden', 'true');
    this.returnButton.hidden = true;

    this.pages.forEach((section) => {
      const active = section.dataset.sitePage === page;
      section.classList.toggle('is-active', active);
      section.hidden = !active;
    });
    this.navigation.forEach((button) => {
      if (button.dataset.siteTarget === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    if (updateHash) history.pushState(null, '', `#${page}`);
    this.portal.scrollTo({ top: 0, behavior: 'auto' });
    if (moveFocus) {
      const heading = this.portal.querySelector<HTMLElement>(`[data-site-page="${page}"] h1`);
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }

  private setChapterOpen(open: boolean, moveFocus: boolean): void {
    this.missionPage.classList.toggle('is-chapter-open', open);
    this.chapterSelect.hidden = open;
    this.chapterSelect.setAttribute('aria-hidden', String(open));
    this.planner.hidden = !open;
    this.planner.setAttribute('aria-hidden', String(!open));

    if (!moveFocus) return;
    window.setTimeout(() => {
      if (open) {
        this.planner.setAttribute('tabindex', '-1');
        this.planner.focus({ preventScroll: true });
      } else {
        this.chapterCard.focus({ preventScroll: true });
      }
    }, 80);
  }

  private readonly openChapterSelect = (): void => {
    this.setChapterOpen(false, false);
    this.showPage('mission', true, false);
    this.chapterSelect.setAttribute('tabindex', '-1');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.chapterSelect.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    window.setTimeout(() => this.chapterCard.focus({ preventScroll: true }), reduceMotion ? 0 : 260);
  };

  private readonly openSelectedChapter = (): void => {
    this.setChapterOpen(true, false);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.planner.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    this.setChapterOpen(true, true);
  };

  private readonly returnToChapterSelect = (): void => {
    this.setChapterOpen(false, true);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.chapterSelect.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  private readonly launchMission = (): void => {
    const payload: StartMissionPayload = {
      levelIndex: this.state.selectedLevelIndex,
      birdQueue: this.state.getSelectedQueue(),
    };
    gameBus.emit('loadout:sync', payload);
    this.portal.classList.add('is-hidden');
    this.portal.setAttribute('aria-hidden', 'true');
    this.app.removeAttribute('aria-hidden');
    this.returnButton.hidden = false;
    history.pushState(null, '', '#play');
    gameBus.once('mission:ready', () => document.getElementById('fire-button')?.focus());
    gameBus.emit('command:start-mission', payload);
  };

  private readonly returnToSite = (): void => {
    this.showPage('mission', window.location.hash !== '#mission', false);
    this.setChapterOpen(true, false);
    this.syncPlanner();
    window.setTimeout(() => this.startButton.focus(), 120);
  };

  private readonly syncSelection = (payload: StartMissionPayload): void => {
    this.state.selectLevel(payload.levelIndex);
    this.state.syncQueue(payload.birdQueue);
    this.syncPlanner();
  };

  private enterLegacyLoadout(updateHash: boolean): void {
    this.portal.classList.add('is-hidden');
    this.portal.setAttribute('aria-hidden', 'true');
    this.app.removeAttribute('aria-hidden');
    this.returnButton.hidden = false;
    if (updateHash) history.pushState(null, '', '#play');
    window.setTimeout(() => document.getElementById('mission-start-button')?.focus(), 180);
  }
}
