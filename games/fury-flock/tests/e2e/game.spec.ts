import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { FIRST_CHAPTER } from '../../src/game/content/chapters';
import { LEVELS } from '../../src/game/content/levels';
import { STAR_PROGRESS_STORAGE_KEY } from '../../src/game/progression/starProgress';
import {
  GALE_SPLIT_MAX_DELAY_MS,
  GALE_SPLIT_MIN_DELAY_MS,
  GALE_SPLIT_ORIGIN_HOLD_MS,
} from '../../src/game/simulation/birdAbilities';

async function configureBirdQueue(page: Page, birdQueue: string[]): Promise<void> {
  const loadout = page.locator('#loadout-screen');
  for (const [index, birdId] of birdQueue.entries()) {
    await loadout.locator(`[data-ammo-slot="${index}"]`).click();
    await loadout.locator(`.bird-option[data-bird-id="${birdId}"]`).click();
  }
}

async function beginTouchDrag(
  page: Page,
  client: CDPSession,
  point: { x: number; y: number },
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 3, radiusY: 3, force: 1 }],
    });
    try {
      await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'dragging', null, { timeout: 4_000 });
      return;
    } catch {
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
  }
  throw new Error('Touch input did not enter the dragging phase after two attempts');
}

const startMission = async (page: Page, levelIndex = 0, birdId = 'scarlet'): Promise<void> => {
  const loadout = page.locator('#loadout-screen');
  await expect(loadout).toHaveClass(/visible/);
  await page.locator(`[data-level-index="${levelIndex}"]`).click();
  await configureBirdQueue(page, Array.from({ length: LEVELS[levelIndex].shots }, () => birdId));
  await page.locator('#mission-start-button').click();
  await expect(loadout).not.toHaveClass(/visible/);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect(page.locator('#mission-launch-screen')).not.toHaveClass(/visible/);
};

async function saveCanvasFrame(page: Page, outputPath: string): Promise<void> {
  const dataUrl = await page.locator('#game-container canvas').evaluate((canvas) =>
    (canvas as HTMLCanvasElement).toDataURL('image/png'));
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new Error('Game canvas did not return a PNG data URL');
  await writeFile(outputPath, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
}

async function waitForGunnerState(page: Page, expectedState: string): Promise<void> {
  await page.waitForFunction((expected) => {
    const state = window.__furyFlock?.getState();
    return ((state?.targets ?? []) as Array<{ gunner?: boolean; gunnerState?: string }>)
      .find((target) => target.gunner)?.gunnerState === expected;
  }, expectedState, { timeout: 4_000 });
}

test('external portal separates mission planning from home and documents every combatant', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/#home');
  const portal = page.locator('#site-portal');
  await expect(portal).toBeVisible();
  await expect(page.locator('[data-site-page="home"]')).toBeVisible();
  await expect(page.locator('[data-site-page="home"] h1')).toContainText('全线倾倒');
  await expect(page.locator('.site-flight-bird')).toHaveCount(4);
  await expect(page.locator('[data-site-page="home"] #site-mission-planner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '战术手册' })).toHaveCount(0);
  await expect(page.locator('#game-container canvas')).toHaveCount(0);
  const hiddenQueueBefore = await page.locator('#loadout-screen .ammo-slot')
    .evaluateAll((slots) => slots.map((slot) => (slot as HTMLElement).dataset.birdId));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await expect(portal).toBeVisible();
  await expect(page.locator('#game-container canvas')).toHaveCount(0);
  await expect.poll(async () => page.locator('#loadout-screen .ammo-slot')
    .evaluateAll((slots) => slots.map((slot) => (slot as HTMLElement).dataset.birdId)))
    .toEqual(hiddenQueueBefore);
  await expect.poll(async () => page.locator('.site-flight-bird').evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete
      && (image as HTMLImageElement).naturalWidth === 256),
  )).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-external-home.png`, fullPage: true });

  await page.getByRole('button', { name: '怒羽图鉴' }).click();
  await expect(page).toHaveURL(/#roster$/);
  await expect(page.locator('[data-site-page="roster"]')).toBeVisible();
  await expect(page.locator('#site-roster-title')).toContainText('战场图鉴');
  await expect(page.locator('.site-bird-profile')).toHaveCount(6);
  await expect(page.locator('.site-bird-profile:not(.is-locked)')).toHaveCount(4);
  await expect(page.locator('.site-bird-profile.is-locked')).toHaveCount(2);
  await expect(page.locator('.site-pig-profile')).toHaveCount(3);
  await expect(page.locator('.site-bird-profile [data-profile-field="stats"]')).toHaveCount(6);
  await expect(page.locator('.site-bird-profile [data-profile-field="trait"]')).toHaveCount(6);
  await expect(page.locator('.site-bird-profile [data-profile-field="skill"]')).toHaveCount(6);
  await expect(page.locator('.site-pig-profile [data-profile-field="stats"]')).toHaveCount(3);
  await expect(page.locator('.site-pig-profile [data-profile-field="trait"]')).toHaveCount(3);
  await expect(page.locator('.site-pig-profile [data-profile-field="skill"]')).toHaveCount(3);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-combatant-codex.png`, fullPage: true });
  await page.locator('#site-pig-codex-title').scrollIntoViewIfNeeded();
  await expect.poll(async () => page.locator('.site-pig-profile img').evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete
      && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-pig-codex.png` });

  await page.getByRole('button', { name: /前往章节/ }).click();
  await expect(page).toHaveURL(/#mission$/);
  await expect(page.locator('[data-site-page="mission"]')).toBeVisible();
  await expect(page.locator('#site-chapter-select')).toBeVisible();
  await expect(page.locator('#site-chapter-card')).toContainText(FIRST_CHAPTER.name);
  await expect(page.locator('#site-mission-planner')).toBeHidden();
  await page.locator('#site-chapter-card').click();
  await expect(page.locator('#site-chapter-select')).toBeHidden();
  await expect(page.locator('#site-mission-planner')).toBeVisible();
  await expect(page.locator('.site-level-node')).toHaveCount(LEVELS.length);
  await expect(page.locator('.site-level-node [data-site-level-stars]')).toHaveCount(LEVELS.length);
  await expect(page.locator('.site-level-act')).toHaveCount(FIRST_CHAPTER.acts.length);
  await expect(page.locator('#site-planner-star-requirements')).toContainText('最多使用 2 发');
  await expect(page.locator('.site-ammo-slot')).toHaveCount(4);
  await expect(page.locator('.site-bird-option')).toHaveCount(4);
  await page.locator('.site-level-node[data-site-level-index="4"]').click();
  await page.locator('.site-ammo-slot[data-site-ammo-slot="1"]').click();
  await page.locator('.site-bird-option[data-site-bird-id="iron"]').click();
  await expect(page.locator('#site-planner-title')).toHaveText('落锤机关');
  await expect(page.locator('.site-ammo-slot').nth(1)).toHaveAttribute('data-bird-id', 'iron');

  await page.locator('#site-planner-start-button').click();
  await expect(portal).toHaveClass(/is-hidden/);
  await expect(page.locator('#loadout-screen')).not.toHaveClass(/visible/);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
    level: 5,
    birdQueue: ['scarlet', 'iron', 'scarlet', 'scarlet'],
  });
  await expect(page.locator('#site-return-button')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => new Set(performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/assets/backgrounds/level-'))
    .map((entry) => new URL(entry.name).pathname)).size))
    .toBeLessThanOrEqual(3);
  if (testInfo.project.name === 'mobile-chromium') {
    const hintOverlapsActions = await page.evaluate(() => {
      const hint = document.getElementById('hint')?.getBoundingClientRect();
      const actions = document.querySelector('.game-actions')?.getBoundingClientRect();
      return Boolean(hint && actions
        && hint.left < actions.right
        && hint.right > actions.left
        && hint.top < actions.bottom
        && hint.bottom > actions.top);
    });
    expect(hintOverlapsActions).toBe(false);
  }
  await page.locator('#site-return-button').click();
  await expect(portal).toBeVisible();
  await expect(page).toHaveURL(/#mission$/);
  await expect(page.locator('#site-planner-title')).toHaveText('落锤机关');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-external-portal-entry.png`, fullPage: true });
});

test('browser back leaves combat without inserting a duplicate mission entry', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/#home');
  await page.getByRole('button', { name: /查看章节/ }).click();
  await expect(page).toHaveURL(/#mission$/);
  await page.locator('#site-chapter-card').click();
  await page.locator('#site-planner-start-button').click();
  await expect(page).toHaveURL(/#play$/);
  await page.goBack();
  await expect(page).toHaveURL(/#mission$/);
  await expect(page.locator('[data-site-page="mission"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#home$/);
});

test('opens on tactical loadout and starts the chosen level with the chosen bird', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const loadout = page.locator('#loadout-screen');
  await expect(loadout).toHaveClass(/visible/);
  await expect(page.locator('.level-node')).toHaveCount(LEVELS.length);
  await expect(page.locator('.bird-option')).toHaveCount(4);
  await expect(page.locator('.bird-option .bird-avatar.generated img')).toHaveCount(4);
  const birdArtLoaded = await page.locator('.bird-option img').evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 256),
  );
  expect(birdArtLoaded).toBe(true);
  await expect(page.locator('.difficulty-feathers i')).toHaveCount(5);
  if (testInfo.project.name === 'mobile-chromium') {
    const startVisibleWithoutScroll = await page.locator('#mission-start-button').evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    });
    expect(startVisibleWithoutScroll).toBe(true);
  }
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
    phase: 'loadout',
    loadoutOpen: true,
    bird: null,
  });

  await page.locator('[data-level-index="4"]').click();
  await configureBirdQueue(page, Array.from({ length: LEVELS[4].shots }, () => 'iron'));
  await expect(page.locator('#selected-level-name')).toHaveText('落锤机关');
  await expect(page.locator('#selected-bird-name')).toHaveText('铁喙重炮');
  await expect(page.locator('#mission-start-button')).toContainText('开始第5关');
  await expect(page.locator('#fortress-preview')).toHaveAttribute('data-preview-level', '4');
  await expect(page.locator('#fortress-preview')).toHaveAttribute(
    'style',
    /level-05-falling-hammer-yard\.webp/,
  );
  await expect(page.locator('.fortress-block')).toHaveCount(LEVELS[4].blocks.length);
  await expect(page.locator('.fortress-target')).toHaveCount(LEVELS[4].targets.length);
  await expect(page.locator('.difficulty-feathers i.active')).toHaveCount(LEVELS[4].difficulty);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-tactical-loadout.png`,
    fullPage: true,
  });
  await page.locator('#mission-start-button').click();

  await expect(loadout).not.toHaveClass(/visible/);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  const state = await page.evaluate(() => window.__furyFlock?.getState());
  expect(state).toMatchObject({
    level: 5,
    birdId: 'iron',
    loadoutOpen: false,
    slingshotTexture: 'prop-slingshot-art',
  });
  await expect(page.locator('#ammo-label')).toHaveText('铁喙重炮');
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-selected-mission.png`,
    fullPage: true,
  });
});

test('Firelock Sentry visibly aims, intercepts automatically, and reloads for the next bird', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.locator('[data-level-index="3"]').click();
  const gunnerPreview = page.locator('.fortress-target[data-gunner="true"]');
  await expect(gunnerPreview).toHaveCount(1);
  await expect(gunnerPreview.locator('img')).toHaveAttribute('src', '/assets/targets/moss-snout-gunner.png');
  await startMission(page, 3, 'scarlet');

  expect(await page.evaluate(() => window.__furyFlock?.launch(16, -7) ?? false)).toBe(true);
  await waitForGunnerState(page, 'aiming');
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-firelock-sentry-aiming.png`,
    fullPage: true,
  });
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    return state?.lastGunnerShot;
  }, { timeout: 4_000 }).toMatchObject({ birdId: 'scarlet', hit: true, exploded: false });
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    return ((state?.targets ?? []) as Array<{ gunner?: boolean; gunnerState?: string }>)
      .find((target) => target.gunner)?.gunnerState;
  }).toBe('spent');
  const scarletState = await page.evaluate(() => window.__furyFlock?.getState());
  const scarletShot = scarletState?.lastGunnerShot as {
    velocityBefore: { x: number; y: number };
    velocityAfter: { x: number; y: number };
  };
  expect(scarletShot.velocityAfter).not.toEqual(scarletShot.velocityBefore);
  expect((scarletState?.targets as Array<{ gunner?: boolean; gunnerShotUsed?: boolean; texture?: string }>)
    .find((target) => target.gunner)).toMatchObject({
      gunnerShotUsed: true,
      gunnerState: 'spent',
      texture: 'enemy-pig-art-moss-snout-gunner',
    });
  expect(await page.evaluate(() => window.__furyFlock?.fireGunnerShot() ?? false)).toBe(false);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-firelock-sentry-deflection.png`,
    fullPage: true,
  });

  expect(await page.evaluate(() => window.__furyFlock?.resolveTurn() ?? false)).toBe(true);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    return ((state?.targets ?? []) as Array<{ gunner?: boolean; gunnerState?: string }>)
      .find((target) => target.gunner)?.gunnerState;
  }).toBe('loaded');

  expect(await page.evaluate(() => window.__furyFlock?.launch(10, -4) ?? false)).toBe(true);
  await waitForGunnerState(page, 'aiming');
  const interrupted = await page.evaluate(() => {
    const targets = (window.__furyFlock?.getState()?.targets ?? []) as Array<{ gunner?: boolean }>;
    const gunnerIndex = targets.findIndex((target) => target.gunner);
    return gunnerIndex >= 0 ? window.__furyFlock?.damageTarget(gunnerIndex, 50) : null;
  });
  expect(interrupted).toMatchObject({ health: 0 });
  await page.waitForTimeout(800);
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.lastGunnerShot ?? null))
    .toBeNull();
  await expect.poll(async () => page.evaluate(() => {
    const targets = (window.__furyFlock?.getState()?.targets ?? []) as Array<{ gunner?: boolean }>;
    return targets.some((target) => target.gunner);
  })).toBe(false);

  await page.reload();
  await startMission(page, 3, 'iron');
  expect(await page.evaluate(() => window.__furyFlock?.launch(16, -7) ?? false)).toBe(true);
  await waitForGunnerState(page, 'aiming');
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    return state?.lastGunnerShot;
  }, { timeout: 4_000 }).toMatchObject({ birdId: 'iron', hit: true, exploded: false });
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-firelock-sentry-iron-deflection.png`,
    fullPage: true,
  });
});

test('Firelock Sentry deflects Iron without causing a mid-air explosion', async ({ page }) => {
  await page.goto('/');
  await startMission(page, 3, 'iron');
  const probe = await page.evaluate(() => {
    const launched = window.__furyFlock?.launch(20, -7) ?? false;
    const fired = window.__furyFlock?.fireGunnerShot(1) ?? false;
    return { launched, fired, state: window.__furyFlock?.getState() };
  });
  expect(probe).toMatchObject({
    launched: true,
    fired: true,
    state: {
      explosionTriggered: false,
      birdPhysics: { abilityUsed: false },
      lastGunnerShot: { birdId: 'iron', hit: true, exploded: false },
    },
  });
});

test('edits every bird ammunition slot in firing order', async ({ page }, testInfo) => {
  await page.goto('/');
  const loadout = page.locator('#loadout-screen');
  const slots = loadout.locator('.ammo-slot');
  await expect(slots).toHaveCount(4);
  await configureBirdQueue(page, ['scarlet', 'iron', 'gale', 'scarlet']);
  await expect(slots.nth(0)).toHaveAttribute('data-bird-id', 'scarlet');
  await expect(slots.nth(1)).toHaveAttribute('data-bird-id', 'iron');
  await expect(slots.nth(2)).toHaveAttribute('data-bird-id', 'gale');
  await expect(slots.nth(3)).toHaveAttribute('data-bird-id', 'scarlet');
  for (const [index, birdId] of ['scarlet', 'iron', 'gale', 'scarlet'].entries()) {
    await expect(slots.nth(index).locator('span')).toHaveText(String(index + 1));
    await expect(slots.nth(index).locator('img')).toHaveAttribute('src', `/assets/birds/${birdId}.png`);
  }
  expect(await slots.nth(1).evaluate((slot) =>
    getComputedStyle(slot).getPropertyValue('--bird-color').trim()))
    .toBe('#9aa1b4');
  await expect(slots.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-mixed-loadout.png`, fullPage: true });

  await page.locator('[data-level-index="7"]').click();
  await expect(slots).toHaveCount(5);
  await expect(slots.nth(4)).toHaveAttribute('data-bird-id', 'scarlet');
  await page.locator('[data-level-index="0"]').click();
  await expect(slots).toHaveCount(4);
});

test('configures ordered ammunition using real mobile touch input', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile touch coverage only');
  await page.goto('/');
  const birdQueue = ['scarlet', 'iron', 'gale', 'iron'];
  for (const [index, birdId] of birdQueue.entries()) {
    await page.locator(`.ammo-slot[data-ammo-slot="${index}"]`).tap();
    await page.locator(`.bird-option[data-bird-id="${birdId}"]`).tap();
  }
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.birdQueue))
    .toEqual(birdQueue);
  await page.locator('#mission-start-button').tap();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.birdQueue))
    .toEqual(birdQueue);
});

test('fires the configured bird queue and updates the mixed HUD', async ({ page }, testInfo) => {
  await page.goto('/');
  await configureBirdQueue(page, ['scarlet', 'iron', 'gale', 'scarlet']);
  await page.locator('#mission-start-button').click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');

  expect(await page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
    birdId: 'scarlet',
    birdQueue: ['scarlet', 'iron', 'gale', 'scarlet'],
    remainingBirdQueue: ['scarlet', 'iron', 'gale', 'scarlet'],
  });
  await expect(page.locator('.ammo-bird')).toHaveCount(4);
  await expect(page.locator('.ammo-bird').nth(0)).toHaveAttribute('data-bird-id', 'scarlet');
  await expect(page.locator('.ammo-bird').nth(1)).toHaveAttribute('data-bird-id', 'iron');
  await expect(page.locator('.ammo-bird').nth(2)).toHaveAttribute('data-bird-id', 'gale');
  await expect(page.locator('#ammo-label')).toBeVisible();
  await expect(page.locator('#ammo-label')).toHaveText('赤羽先锋');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-mixed-hud.png`, fullPage: true });

  const firstLaunch = await page.evaluate(() => {
    const api = window.__furyFlock as typeof window.__furyFlock & { resolveTurn?: () => boolean };
    const launched = api?.launch(12, -4) ?? false;
    const state = api?.getState();
    const hudBirds = [...document.querySelectorAll<HTMLElement>('.ammo-bird')]
      .map((icon) => icon.dataset.birdId);
    const label = document.getElementById('ammo-label')?.textContent;
    const resolved = api?.resolveTurn?.() ?? false;
    return { launched, resolved, state, hudBirds, label };
  });
  expect(firstLaunch).toMatchObject({
    launched: true,
    resolved: true,
    hudBirds: ['iron', 'gale', 'scarlet'],
    label: '赤羽先锋',
    state: { birdId: 'scarlet', remainingBirdQueue: ['iron', 'gale', 'scarlet'] },
  });
  await page.waitForFunction(() => {
    const state = window.__furyFlock?.getState();
    return state?.phase === 'ready' && state?.birdId === 'iron';
  }, null, { timeout: 8_000 });
  await expect(page.locator('#ammo-label')).toHaveText('铁喙重炮');

  const secondLaunch = await page.evaluate(() => {
    const api = window.__furyFlock as typeof window.__furyFlock & { resolveTurn?: () => boolean };
    const launched = api?.launch(12, -4) ?? false;
    const state = api?.getState();
    const resolved = api?.resolveTurn?.() ?? false;
    return { launched, resolved, state };
  });
  expect(secondLaunch).toMatchObject({ launched: true, resolved: true, state: { birdId: 'iron' } });
  await page.waitForFunction(() => {
    const state = window.__furyFlock?.getState();
    return state?.phase === 'ready' && state?.birdId === 'gale';
  }, null, { timeout: 8_000 });
  await expect(page.locator('#ammo-label')).toHaveText('风翎游侠');
});

test('applies each queued bird texture and density in sequence', async ({ page }) => {
  await page.goto('/');
  await configureBirdQueue(page, ['scarlet', 'iron', 'gale', 'scarlet']);
  await page.locator('#mission-start-button').click();
  const cases = [
    { birdId: 'scarlet', density: 0.001 },
    { birdId: 'iron', density: 0.00165 },
    { birdId: 'gale', density: 0.00072 },
  ];

  for (const birdCase of cases) {
    await page.waitForFunction((birdId) => {
      const state = window.__furyFlock?.getState();
      return state?.phase === 'ready' && state?.birdId === birdId;
    }, birdCase.birdId);
    const ready = await page.evaluate(() => window.__furyFlock?.getState());
    expect(ready?.birdTexture).toBe(`hero-bird-art-${birdCase.birdId}`);

    const result = await page.evaluate(() => {
      const launched = window.__furyFlock?.launch(12, -4) ?? false;
      const launchedPhysics = window.__furyFlock?.getState()?.birdPhysics as { density?: number } | null;
      const resolved = window.__furyFlock?.resolveTurn() ?? false;
      return { launched, density: launchedPhysics?.density, resolved };
    });
    expect(result.launched).toBe(true);
    expect(result.resolved).toBe(true);
    expect(Number(result.density)).toBeCloseTo(birdCase.density, 6);
  }
});

test('boots into a playable first screen and supports the main action loop', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startMission(page);
  const canvas = page.locator('#game-container canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.topbar').getByText('怒羽突击', { exact: true })).toBeVisible();
  await expect(page.locator('#level-value')).toHaveText(`1 / ${LEVELS.length}`);
  await expect(page.locator('.ammo-bird')).toHaveCount(4);

  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no visible bounds');
  const anchor = {
    x: bounds.x + bounds.width * (218 / 1_200),
    y: bounds.y + bounds.height * (470 / 675),
  };
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(
    anchor.x - bounds.width * (112 / 1_200),
    anchor.y + bounds.height * (48 / 675),
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator('.ammo-bird')).toHaveCount(3);
  await expect(page.locator('#hint-text')).toContainText(/中心线|精准破点/);

  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.48);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-flight.png`,
    fullPage: true,
  });
});

test('uses the generated Moss-Snout art for every target', async ({ page }) => {
  await page.goto('/');
  await startMission(page);
  const textures = await page.evaluate(() => {
    const targets = window.__furyFlock?.getState()?.targets as Array<{ texture?: string }> | undefined;
    return targets?.map((target) => target.texture ?? '') ?? [];
  });
  expect(textures.length).toBeGreaterThan(0);
  expect(new Set(textures)).toEqual(new Set(['enemy-pig-art-moss-snout']));
});

test('armored Moss-Snout absorbs one hit before taking damage', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.locator('[data-level-index="4"]').click();
  const armoredPreview = page.locator('.fortress-target[data-armored="true"]');
  await expect(armoredPreview).toHaveCount(1);
  await expect(armoredPreview.locator('img'))
    .toHaveAttribute('src', '/assets/targets/moss-snout-helmet.png');

  await startMission(page, 4);
  await expect.poll(async () => page.evaluate(() => {
    const targets = window.__furyFlock?.getState()?.targets as Array<{
      armorHitsRemaining?: number;
      texture?: string;
    }> | undefined;
    return targets?.find((target) => target.armorHitsRemaining === 1);
  })).toMatchObject({
    armorHitsRemaining: 1,
    texture: 'enemy-pig-art-moss-snout-helmet',
  });
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-armored-moss-snout.png`,
    fullPage: true,
  });

  const firstHit = await page.evaluate(() => {
    const api = window.__furyFlock as typeof window.__furyFlock & {
      damageTarget?: (targetIndex: number, damage: number) => Record<string, unknown> | null;
    };
    return api?.damageTarget?.(1, 5) ?? null;
  });
  expect(firstHit).toMatchObject({
    health: 15,
    armorHitsRemaining: 0,
    absorbed: true,
    texture: 'enemy-pig-art-moss-snout',
  });
  // Let the 260ms armor-break guard and camera shake finish before the follow-up hit.
  // This keeps one collision cascade from erasing the readable broken-helmet state.
  await page.waitForTimeout(320);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-armored-moss-snout-broken.png`,
    fullPage: true,
  });

  const secondHit = await page.evaluate(() => {
    const api = window.__furyFlock as typeof window.__furyFlock & {
      damageTarget?: (targetIndex: number, damage: number) => Record<string, unknown> | null;
    };
    return api?.damageTarget?.(1, 5) ?? null;
  });
  expect(secondHit).toMatchObject({
    health: 10,
    armorHitsRemaining: 0,
    absorbed: false,
    texture: 'enemy-pig-art-moss-snout',
  });
});

test('pause and restart recover to a stable state', async ({ page }) => {
  await page.goto('/');
  await startMission(page);
  await page.locator('#pause-button').click();
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/);
  await expect(page.locator('#result-title')).toHaveText('风停在半空');
  await page.getByRole('button', { name: /继续战斗/ }).click();
  await expect(page.locator('#result-overlay')).not.toHaveClass(/visible/);

  await page.waitForFunction(() => window.__furyFlock?.launch() === true);
  await expect(page.locator('.ammo-bird')).toHaveCount(3);
  await page.locator('#restart-button').click();
  await expect(page.locator('.ammo-bird')).toHaveCount(4);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
});

test('quick fire fallback launches when drag input is unavailable', async ({ page }) => {
  await page.goto('/');
  await startMission(page);
  const quickFire = page.getByRole('button', { name: '一键发射' });
  await expect(quickFire).toBeVisible();
  await quickFire.click();
  await expect(page.locator('.ammo-bird')).toHaveCount(3);
  await expect(page.locator('#hint-text')).toContainText(/中心线|精准破点/);
});

test('keyboard controls navigate loadout, launch, quick-fire and pause', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop keyboard coverage only');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/, { timeout: 15_000 });
  await expect(page.locator('.level-node')).toHaveCount(LEVELS.length, { timeout: 15_000 });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('2');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.level-node[data-level-index="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.bird-option[data-bird-id="iron"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ammo-slot[data-ammo-slot="0"]')).toHaveAttribute('data-bird-id', 'iron');
  await expect(page.locator('.ammo-slot[data-ammo-slot="1"]')).toHaveAttribute('data-bird-id', 'iron');

  await page.keyboard.press('Enter');
  await expect(page.locator('#loadout-screen')).not.toHaveClass(/visible/);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect(page.locator('#level-value')).toHaveText(`3 / ${LEVELS.length}`);
  await expect(page.locator('#ammo-label')).toHaveText('铁喙重炮');

  await page.keyboard.press('Space');
  await expect(page.locator('.ammo-bird')).toHaveCount(LEVELS[2].shots - 1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/);
  await expect(page.locator('#result-title')).toHaveText('风停在半空');
});

test('Enter starts the mission after pointer-based loadout editing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop keyboard coverage only');
  await page.goto('/');
  await page.locator('.ammo-slot[data-ammo-slot="1"]').click();
  await page.locator('.bird-option[data-bird-id="iron"]').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#loadout-screen')).not.toHaveClass(/visible/);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
});

test('touch drag launches the bird on a mobile viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile touch coverage only');
  test.setTimeout(60_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/, { timeout: 15_000 });
  await startMission(page);
  const canvas = page.locator('#game-container canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no visible bounds');
  const anchor = {
    x: bounds.x + bounds.width * (218 / 1_200),
    y: bounds.y + bounds.height * (470 / 675),
  };
  const target = {
    x: anchor.x - bounds.width * (112 / 1_200),
    y: anchor.y + bounds.height * (48 / 675),
  };
  const client = await page.context().newCDPSession(page);
  await beginTouchDrag(page, client, anchor);
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: anchor.x + (target.x - anchor.x) * (step / 6),
        y: anchor.y + (target.y - anchor.y) * (step / 6),
        id: 1,
        radiusX: 3,
        radiusY: 3,
        force: 1,
      }],
    });
  }
  await page.waitForFunction(() => {
    const state = window.__furyFlock?.getState();
    const bird = state?.bird as { x?: number } | null;
    return state?.phase === 'dragging' && Number(bird?.x ?? 999) < 150;
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'flying');
  await client.detach();

  await expect(page.locator('.ammo-bird')).toHaveCount(LEVELS[0].shots - 1);
  const state = await page.evaluate(() => window.__furyFlock?.getState());
  expect(state?.birdPhysics).toMatchObject({ isStatic: false, isSleeping: false });
});

test('releasing a pulled bird outside the canvas still launches it', async ({ page }) => {
  await page.goto('/');
  await startMission(page);
  const canvas = page.locator('#game-container canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no visible bounds');
  const anchor = {
    x: bounds.x + bounds.width * (218 / 1_200),
    y: bounds.y + bounds.height * (470 / 675),
  };
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'dragging');
  await page.mouse.move(Math.max(1, bounds.x - 12), anchor.y + bounds.height * (56 / 675), { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.ammo-bird')).toHaveCount(3);
  const releasedState = await page.evaluate(() => window.__furyFlock?.getState());
  expect(releasedState?.birdPhysics).toMatchObject({ isStatic: false, isSleeping: false });
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    return Number((state?.bird as { x?: number } | null)?.x ?? 0);
  }, { timeout: 3_000 }).toBeGreaterThan(340);
});

test('cancelling a touch drag returns the bird to ready without firing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile touch cancellation coverage only');
  await page.goto('/');
  await startMission(page);
  const canvas = page.locator('#game-container canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no visible bounds');
  const anchor = {
    x: bounds.x + bounds.width * (218 / 1_200),
    y: bounds.y + bounds.height * (470 / 675),
  };
  const target = {
    x: anchor.x - bounds.width * (90 / 1_200),
    y: anchor.y + bounds.height * (42 / 675),
  };
  const client = await page.context().newCDPSession(page);
  await beginTouchDrag(page, client, anchor);
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: anchor.x + (target.x - anchor.x) * (step / 6),
        y: anchor.y + (target.y - anchor.y) * (step / 6),
        id: 1,
        radiusX: 3,
        radiusY: 3,
        force: 1,
      }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });

  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.phase)).toBe('ready');
  await expect(page.locator('.ammo-bird')).toHaveCount(4);
  await client.detach();
});

test('free flight stays aligned with the dotted trajectory', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startMission(page);
  const canvas = page.locator('#game-container canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no visible bounds');
  const anchor = {
    x: bounds.x + bounds.width * (218 / 1_200),
    y: bounds.y + bounds.height * (470 / 675),
  };
  const target = {
    x: anchor.x - bounds.width * (112 / 1_200),
    y: anchor.y + bounds.height * (48 / 675),
  };
  if (testInfo.project.name === 'mobile-chromium') {
    const client = await page.context().newCDPSession(page);
    await beginTouchDrag(page, client, anchor);
    for (let step = 1; step <= 8; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: anchor.x + (target.x - anchor.x) * (step / 8),
          y: anchor.y + (target.y - anchor.y) * (step / 8),
          id: 1,
          radiusX: 3,
          radiusY: 3,
          force: 1,
        }],
      });
    }
    await page.waitForFunction(() => Number((window.__furyFlock?.getState()?.bird as { x?: number } | null)?.x ?? 999) < 140);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  } else {
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'dragging');
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.waitForFunction(() => Number((window.__furyFlock?.getState()?.bird as { x?: number } | null)?.x ?? 999) < 140);
    await page.mouse.up();
  }
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'flying');
  const sampleHandle = await page.waitForFunction(() => {
    const api = window.__furyFlock;
    const state = api?.getState();
    const bird = state?.bird as { x?: number; y?: number } | null;
    if (!bird || Number(bird.x ?? 0) < 380) return null;
    return {
      actual: { x: Number(bird.x), y: Number(bird.y) },
      dottedY: api?.predictYAtX(Number(bird.x)),
      launch: state?.launch,
    };
  });
  const { actual, dottedY, launch } = await sampleHandle.jsonValue() as {
    actual: { x: number; y: number };
    dottedY: number | null;
    launch: unknown;
  };
  await sampleHandle.dispose();
  expect(dottedY).not.toBeNull();
  expect(
    Math.abs(actual.y - Number(dottedY)),
    `free-flight sample ${JSON.stringify({ actual, dottedY, launch })}`,
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-trajectory-alignment.png`,
    fullPage: true,
  });
});

test('a sleeping target falls after its support is destroyed', async ({ page }, testInfo) => {
  await page.goto('/');
  await startMission(page);
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    const targets = state?.targets as Array<{ isSleeping?: boolean }> | undefined;
    return targets?.[0]?.isSleeping ?? false;
  }, { timeout: 4_000 }).toBe(true);

  const removed = await page.evaluate(() => window.__furyFlock?.removeSupportUnderTarget());
  expect(removed).not.toBeNull();
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__furyFlock?.getState());
    const targets = state?.targets as Array<{ x?: number; y?: number }> | undefined;
    const target = targets?.find((candidate) => Math.abs(Number(candidate.x) - Number(removed?.x)) < 2);
    return Number(target?.y ?? 0);
  }, { timeout: 3_000 }).toBeGreaterThan(Number(removed?.initialY) + 24);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-unsupported-target-falls.png`,
    fullPage: true,
  });
});

test('the sunset bell tower remains stable before the first shot', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startMission(page, 15);
  const authoredTargets = LEVELS[15].targets;
  const before = await page.evaluate(() => window.__furyFlock?.getState()?.targets) as Array<{
    x: number;
    y: number;
  }>;
  await page.waitForTimeout(1_000);
  const after = await page.evaluate(() => window.__furyFlock?.getState()?.targets) as Array<{
    x: number;
    y: number;
    isSleeping: boolean;
  }>;
  expect(after).toHaveLength(authoredTargets.length);
  expect(after.every((target) => target.isSleeping)).toBe(true);
  for (const [index, target] of after.entries()) {
    expect(Math.abs(target.x - authoredTargets[index].x)).toBeLessThanOrEqual(2);
    expect(Math.abs(target.y - authoredTargets[index].y)).toBeLessThanOrEqual(2);
    expect(Math.abs(target.x - before[index].x)).toBeLessThanOrEqual(2);
    expect(Math.abs(target.y - before[index].y)).toBeLessThanOrEqual(2);
  }
});

test('winning a level opens the result and advances the campaign', async ({ page }) => {
  await page.goto('/');
  await startMission(page);
  const completed = await page.evaluate(() => window.__furyFlock?.completeLevel());
  expect(completed).toBe(true);
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await expect(page.locator('#result-title')).toHaveText('漂亮一击！');
  await page.getByRole('button', { name: /下一关/ }).click();
  await expect(page.locator('#level-value')).toHaveText(`2 / ${LEVELS.length}`);
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
});

test('shows zero to three stars and never replaces a higher saved rating', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.evaluate((key) => localStorage.removeItem(key), STAR_PROGRESS_STORAGE_KEY);
  await startMission(page);

  for (let shot = 0; shot < LEVELS[0].shots; shot += 1) {
    expect(await page.evaluate(() => window.__furyFlock?.launch(12, -4))).toBe(true);
    expect(await page.evaluate(() => window.__furyFlock?.resolveTurn())).toBe(true);
    if (shot < LEVELS[0].shots - 1) {
      await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
    }
  }
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await expect(page.locator('#result-star-count')).toHaveText('0 / 3');
  await expect(page.locator('#result-stars')).toHaveAttribute('aria-label', '本次 0 星');
  expect(await page.evaluate((key) => localStorage.getItem(key), STAR_PROGRESS_STORAGE_KEY)).toBeNull();

  await page.getByRole('button', { name: /再试一次/ }).click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  expect(await page.evaluate(() => window.__furyFlock?.completeLevel())).toBe(true);
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await expect(page.locator('#result-star-count')).toHaveText('3 / 3');
  await expect(page.locator('#result-star-record')).toContainText('新纪录');
  await expect(page.locator('#result-star-requirements')).toContainText('最多使用 2 发');
  await expect.poll(async () => page.evaluate(() => {
    const card = document.querySelector('.result-card')?.getBoundingClientRect();
    return Boolean(card
      && card.left >= 0
      && card.right <= window.innerWidth
      && card.top >= 0
      && card.bottom <= window.innerHeight
      && document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  })).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-three-star-result.png`, fullPage: true });
  expect(await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { bestStars?: number[] };
    return saved.bestStars?.[0];
  }, STAR_PROGRESS_STORAGE_KEY)).toBe(3);

  await page.locator('#result-loadout-button').click();
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/);
  await expect(page.locator('[data-level-index="0"] [data-level-stars]')).toHaveText('★★★');
  await startMission(page);
  for (let shot = 0; shot < 3; shot += 1) {
    expect(await page.evaluate(() => window.__furyFlock?.launch(12, -4))).toBe(true);
    expect(await page.evaluate(() => window.__furyFlock?.resolveTurn())).toBe(true);
    await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  }
  expect(await page.evaluate(() => window.__furyFlock?.completeLevel())).toBe(true);
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await expect(page.locator('#result-star-count')).toHaveText('2 / 3');
  await expect(page.locator('#result-star-record')).toContainText('历史最高 3 星');
  expect(await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { bestStars?: number[] };
    return saved.bestStars?.[0];
  }, STAR_PROGRESS_STORAGE_KEY)).toBe(3);
});

test('levels thirty-two through forty load stable authored structures on both viewports', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await startMission(page, 31);

  for (const [offset, level] of LEVELS.slice(31).entries()) {
    const levelIndex = offset + 31;
    await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
    await expect(page.locator('#level-value')).toHaveText(`${levelIndex + 1} / ${LEVELS.length}`);
    await expect(page.locator('.ammo-bird')).toHaveCount(level.shots);

    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__furyFlock?.getState());
      const targets = state?.targets as Array<{ isSleeping?: boolean }> | undefined;
      return targets?.length === level.targets.length && targets.every((target) => target.isSleeping);
    }, { timeout: 5_000 }).toBe(true);

    const state = await page.evaluate(() => window.__furyFlock?.getState());
    expect(state?.backgroundTexture).toBe(`level-background-${levelIndex + 1}`);
    const targets = state?.targets as Array<{ x: number; y: number; armored: boolean; gunner: boolean }>;
    expect(targets.map((target) => target.armored)).toEqual(level.targets.map((target) => Boolean(target.armored)));
    expect(targets.map((target) => target.gunner)).toEqual(level.targets.map((target) => Boolean(target.gunner)));
    for (const [targetIndex, target] of targets.entries()) {
      expect(Math.abs(target.x - level.targets[targetIndex].x)).toBeLessThanOrEqual(18);
      expect(Math.abs(target.y - level.targets[targetIndex].y)).toBeLessThanOrEqual(18);
    }

    await saveCanvasFrame(page, `test-results/${testInfo.project.name}-level-${levelIndex + 1}.png`);
    if (levelIndex === LEVELS.length - 1) {
      await expect.poll(async () => page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )).toBe(true);
      await page.screenshot({
        path: `test-results/${testInfo.project.name}-level-${levelIndex + 1}-viewport.png`,
        fullPage: true,
      });
    }
    const completed = await page.evaluate(() => window.__furyFlock?.completeLevel());
    expect(completed).toBe(true);
    await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });

    if (levelIndex === LEVELS.length - 1) {
      await expect(page.locator('#result-title')).toHaveText('怒羽凯旋！');
      await expect(page.locator('#result-copy')).toContainText('四十座堡垒');
      break;
    }

    await page.getByRole('button', { name: /下一关/ }).click();
    await expect(page.locator('#result-overlay')).not.toHaveClass(/visible/);
  }

  expect(consoleErrors).toEqual([]);
});

test('all forty levels load with stable targets and matching HUD data', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await startMission(page);
  const overlay = page.locator('#result-overlay');

  for (const [index, level] of LEVELS.entries()) {
    await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
    await expect(page.locator('#level-value')).toHaveText(`${index + 1} / ${LEVELS.length}`);
    await expect(page.locator('.ammo-bird')).toHaveCount(level.shots);

    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__furyFlock?.getState());
      const targets = state?.targets as Array<{ isSleeping?: boolean }> | undefined;
      return targets?.length === level.targets.length && targets.every((target) => target.isSleeping);
    }, { timeout: 5_000 }).toBe(true);

    const state = await page.evaluate(() => window.__furyFlock?.getState());
    expect(state?.backgroundTexture).toBe(`level-background-${index + 1}`);
    const targets = state?.targets as Array<{ x: number; y: number }>;
    for (const [targetIndex, target] of targets.entries()) {
      expect(Math.abs(target.x - level.targets[targetIndex].x)).toBeLessThanOrEqual(18);
      expect(Math.abs(target.y - level.targets[targetIndex].y)).toBeLessThanOrEqual(18);
    }

    if ([3, 5, 7, 8, 9, 10, 11, 12, 13, 17, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39].includes(index)) {
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await saveCanvasFrame(page, `test-results/${testInfo.project.name}-level-${index + 1}.png`);
    }

    if (index === LEVELS.length - 1) {
      const completed = await page.evaluate(() => window.__furyFlock?.completeLevel());
      expect(completed).toBe(true);
      await expect(overlay).toHaveClass(/visible/, { timeout: 10_000 });
      await expect(page.locator('#result-title')).toHaveText('怒羽凯旋！');
      await expect(page.locator('#result-copy')).toContainText('四十座堡垒');
      await page.getByRole('button', { name: /再玩一轮/ }).click();
      await expect(overlay).not.toHaveClass(/visible/);
      await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
      await expect(page.locator('#level-value')).toHaveText(`1 / ${LEVELS.length}`);
      break;
    }
    const completed = await page.evaluate(() => window.__furyFlock?.completeLevel());
    expect(completed).toBe(true);
    await expect(overlay).toHaveClass(/visible/, { timeout: 10_000 });
    await page.getByRole('button', { name: /下一关/ }).click();
    await expect(overlay).not.toHaveClass(/visible/);
  }
});

test('pause overlay can return to tactical loadout', async ({ page }) => {
  await page.goto('/');
  await startMission(page, 2, 'gale');
  await page.locator('#pause-button').click();
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/);
  await page.locator('#result-loadout-button').click();
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/);
  await expect(page.locator('[data-level-index="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#loadout-screen .bird-option[data-bird-id="gale"]')).toHaveAttribute('aria-pressed', 'true');
});

test('result overlay can return to tactical loadout', async ({ page }) => {
  await page.goto('/');
  await startMission(page, 1, 'scarlet');
  expect(await page.evaluate(() => window.__furyFlock?.completeLevel())).toBe(true);
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await page.locator('#result-loadout-button').click();
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/);
  await expect(page.locator('[data-level-index="1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('preserves a mixed queue across retry, loadout return, and level capacity changes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const birdQueue = ['scarlet', 'iron', 'gale', 'iron'];
  await page.locator('[data-level-index="6"]').click();
  await configureBirdQueue(page, birdQueue);
  await page.locator('#mission-start-button').click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.birdQueue))
    .toEqual(birdQueue);

  expect(await page.evaluate(() => window.__furyFlock?.launch(12, -4))).toBe(true);
  await page.locator('#restart-button').click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.birdQueue))
    .toEqual(birdQueue);

  await page.locator('#pause-button').click();
  await page.locator('#result-loadout-button').click();
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/);
  for (const [index, birdId] of birdQueue.entries()) {
    await expect(page.locator(`.ammo-slot[data-ammo-slot="${index}"]`))
      .toHaveAttribute('data-bird-id', birdId);
  }

  await page.locator('#mission-start-button').click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  expect(await page.evaluate(() => window.__furyFlock?.completeLevel())).toBe(true);
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await page.getByRole('button', { name: /下一关/ }).click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
    level: 8,
    birdQueue: ['scarlet', 'iron', 'gale', 'iron', 'iron'],
  });

  expect(await page.evaluate(() => window.__furyFlock?.completeLevel())).toBe(true);
  await expect(page.locator('#result-overlay')).toHaveClass(/visible/, { timeout: 10_000 });
  await page.locator('#result-loadout-button').click();
  await expect(page.locator('#loadout-screen')).toHaveClass(/visible/);
  await page.locator('[data-level-index="0"]').click();
  await page.locator('#mission-start-button').click();
  await page.waitForFunction(() => window.__furyFlock?.getState()?.phase === 'ready');
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
    level: 1,
    birdQueue,
  });
});

test('iron bird ignores launch-zone ground contact from a fully stretched sling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One deterministic renderer pass is enough for the spatial guard.');
  await page.goto('/');
  await startMission(page, 0, 'iron');
  const probe = await page.evaluate(() => {
    const launched = window.__furyFlock?.launch(16, -17) ?? false;
    return { launched, state: window.__furyFlock?.getState() };
  });
  expect(probe.launched).toBe(true);
  const state = probe.state;
  expect((state?.launch as { origin?: { y?: number } } | null)?.origin?.y).toBeGreaterThan(594);
  expect((state?.bird as { x?: number } | null)?.x).toBeLessThan(368);
  expect(state).toMatchObject({
    ironImpactArmed: false,
    explosionTriggered: false,
    birdPhysics: { abilityUsed: false },
  });
  await page.waitForFunction(() => window.__furyFlock?.getState()?.explosionTriggered === true, null, { timeout: 8_000 });
  await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
    ironImpactArmed: true,
    explosionTriggered: true,
    birdPhysics: { abilityUsed: true },
  });
  await page.screenshot({ path: 'test-results/desktop-chromium-iron-arming-guard.png', fullPage: true });
});

test('gale fragments visibly release from the exact live bird origin', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One deterministic renderer pass is enough for split-origin QA.');
  await page.goto('/');
  await startMission(page, 0, 'gale');
  expect(await page.evaluate(() => window.__furyFlock?.launch(16, -4) ?? false)).toBe(true);
  await page.waitForFunction(() => {
    const split = window.__furyFlock?.getState()?.lastSplit as { released?: boolean } | null;
    return split?.released === true;
  }, null, { timeout: 4_000 });
  const split = (await page.evaluate(() => window.__furyFlock?.getState()?.lastSplit)) as {
    x: number;
    y: number;
    releaseDelayMs: number;
    spawnPositions: Array<{ x: number; y: number }>;
  };
  expect(split.releaseDelayMs).toBe(GALE_SPLIT_ORIGIN_HOLD_MS);
  expect(split.spawnPositions).toEqual([
    { x: split.x, y: split.y },
    { x: split.x, y: split.y },
    { x: split.x, y: split.y },
  ]);
  await page.screenshot({ path: 'test-results/desktop-chromium-gale-split-origin.png', fullPage: true });
});

test('all four birds use generated art and apply their automatic ability rules', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const birdIds = ['scarlet', 'iron', 'gale', 'verdant'] as const;

  await page.goto('/');
  for (const [index, birdId] of birdIds.entries()) {
    await startMission(page, 0, birdId);
    await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState()?.birdTexture))
      .toBe(`hero-bird-art-${birdId}`);

    const launched = await page.evaluate((id) => window.__furyFlock?.launch(
      16,
      id === 'scarlet' ? -6 : id === 'iron' || id === 'verdant' ? -1 : -4,
    ) ?? false, birdId);
    expect(launched).toBe(true);

    if (birdId === 'scarlet') {
      const scarletState = await (await page.waitForFunction(() => {
        const state = window.__furyFlock?.getState();
        return state?.lastScarletPrecision ? state : false;
      }, null, { timeout: 4_000 })).jsonValue();
      expect(scarletState).toMatchObject({
        activeBirdBodies: 1,
        splitTriggered: false,
        explosionTriggered: false,
        birdPhysics: { abilityUsed: false },
        lastScarletPrecision: { damageMultiplier: 1.32, bonusPoints: 320 },
        birdTelemetry: {
          activeShot: {
            birdId: 'scarlet',
            precisionHits: 1,
            abilityTriggers: { 'precision-strike': 1 },
          },
        },
      });
    } else if (birdId === 'iron') {
      await page.waitForFunction(() => {
        const state = window.__furyFlock?.getState();
        return state?.explosionTriggered === true && state?.lastExplosion !== null;
      }, null, { timeout: 8_000 });
      await expect.poll(async () => page.evaluate(() => window.__furyFlock?.getState())).toMatchObject({
        activeBirdBodies: 1,
        explosionTriggered: true,
        birdPhysics: { abilityUsed: true },
        lastExplosion: { radius: 168 },
      });
    } else if (birdId === 'gale') {
      await page.waitForFunction(() => {
        const state = window.__furyFlock?.getState();
        return state?.splitTriggered === true && state?.activeBirdBodies === 3;
      }, null, { timeout: 4_000 });
      const state = await page.evaluate(() => window.__furyFlock?.getState());
      const copies = state?.birdCopies as Array<{ texture?: string; width?: number }>;
      const split = state?.lastSplit as {
        x: number;
        y: number;
        flightAge: number;
        trigger: string;
        spawnPositions: Array<{ x: number; y: number }>;
      };
      expect(copies).toHaveLength(3);
      expect(copies.every((copy) => copy.texture === 'hero-bird-art-gale')).toBe(true);
      expect(copies.every((copy) => Number(copy.width) < 92)).toBe(true);
      expect(split.flightAge).toBeGreaterThanOrEqual(GALE_SPLIT_MIN_DELAY_MS);
      expect(split.flightAge).toBeLessThanOrEqual(GALE_SPLIT_MAX_DELAY_MS + 50);
      expect(['battlefield', 'target-proximity', 'timeout']).toContain(split.trigger);
      expect(split.x).toBeLessThan(830);
      expect(split.spawnPositions).toEqual([
        { x: split.x, y: split.y },
        { x: split.x, y: split.y },
        { x: split.x, y: split.y },
      ]);
    } else {
      await page.waitForFunction(() => {
        const phasePass = window.__furyFlock?.getState()?.lastPhasePass as { completed?: boolean } | null;
        return phasePass?.completed === true;
      }, null, { timeout: 8_000 });
      const state = await page.evaluate(() => window.__furyFlock?.getState());
      expect(state).toMatchObject({
        phaseTriggered: true,
        birdTexture: 'hero-bird-art-verdant',
        birdPhysics: { abilityUsed: true, phasing: false },
        lastPhasePass: {
          completed: true,
          obstacleLabel: 'block:wood',
        },
      });
      const phasePass = state?.lastPhasePass as {
        birdXAtStart: number;
        birdXAtEnd: number;
        obstacleMaxX: number;
        obstacleHealthBefore: number;
        obstacleHealthAfter: number;
      };
      expect(phasePass.obstacleHealthAfter).toBe(phasePass.obstacleHealthBefore);
      expect(phasePass.birdXAtEnd).toBeGreaterThan(phasePass.obstacleMaxX);
    }

    if (testInfo.project.name === 'desktop-chromium') {
      await page.screenshot({
        path: `test-results/desktop-chromium-${birdId}-ability.png`,
        fullPage: true,
      });
    }
    if (index < birdIds.length - 1) {
      await page.locator('#pause-button').click();
      await page.locator('#result-loadout-button').click();
      await expect(page.locator('#loadout-screen')).toHaveClass(/visible/);
    }
  }
});
