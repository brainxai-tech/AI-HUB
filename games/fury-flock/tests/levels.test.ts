import { describe, expect, it } from 'vitest';
import { LEVEL_BACKGROUNDS } from '../src/game/content/backgrounds';
import {
  GROUND_Y,
  LEVELS,
  WORLD_WIDTH,
  type Material,
} from '../src/game/content/levels';

const PREVIOUS_EXPANSION_LEVEL_NAMES = [
  '雾港吊桥',
  '雷云阶城',
  '斜阳钟楼',
  '赤炉心城',
  '三门回廊',
  '镜湖浮城',
  '裂冠竞技场',
  '风暴螺旋',
  '暮色军械库',
  '天穹王座',
];

const LATEST_LEVEL_NAMES = [
  '月蚀水门',
  '碎星天梯',
  '双铳峡口',
  '沉钟地宫',
  '镜面岔城',
  '三羽回声谷',
  '铁雨断桥',
  '终焉星垒',
];

const FINAL_EXPANSION_LEVEL_NAMES = [
  '烬桥天衡',
  '幽幕穿城',
  '云裂翼塔',
  '熔心双仓',
  '曙光鸦冠',
];

const BONUS_EXPANSION_LEVEL_NAMES = [
  '霜镜折廊',
  '长风三叠台',
  '黑潮爆心库',
  '万羽天门',
];

describe('campaign level content', () => {
  it('expands the campaign to forty uniquely named levels', () => {
    expect(LEVELS).toHaveLength(40);
    expect(LEVELS.slice(13, 23).map((level) => level.name)).toEqual(PREVIOUS_EXPANSION_LEVEL_NAMES);
    expect(LEVELS.slice(23, 31).map((level) => level.name)).toEqual(LATEST_LEVEL_NAMES);
    expect(LEVELS.slice(31, 36).map((level) => level.name)).toEqual(FINAL_EXPANSION_LEVEL_NAMES);
    expect(LEVELS.slice(36).map((level) => level.name)).toEqual(BONUS_EXPANSION_LEVEL_NAMES);
    expect(new Set(LEVELS.map((level) => level.name)).size).toBe(40);
    expect(LEVELS.map((level) => level.difficulty)).toEqual([1, 2, 2, 3, 3, 4, 4, ...Array(33).fill(5)]);
  });

  it('maps every level to its own texture key and an authored or intentionally reused environment plate', () => {
    expect(LEVEL_BACKGROUNDS).toHaveLength(LEVELS.length);
    expect(new Set(LEVEL_BACKGROUNDS.map((background) => background.textureKey)).size).toBe(LEVELS.length);
    expect(new Set(LEVEL_BACKGROUNDS.slice(0, 23).map((background) => background.assetPath)).size).toBe(23);
    expect(new Set(LEVEL_BACKGROUNDS.slice(23, 31).map((background) => background.assetPath)).size).toBe(8);
    expect(new Set(LEVEL_BACKGROUNDS.slice(31, 36).map((background) => background.assetPath)).size).toBe(5);
    expect(new Set(LEVEL_BACKGROUNDS.slice(36).map((background) => background.assetPath)).size).toBe(4);
    expect(new Set(LEVEL_BACKGROUNDS.map((background) => background.assetPath)).size).toBe(31);
    expect(LEVEL_BACKGROUNDS[27].assetPath).toContain('level-28-mirror-fork-city.webp');
    expect(LEVEL_BACKGROUNDS[30].assetPath).toContain('level-31-final-star-bastion.webp');
    expect(LEVEL_BACKGROUNDS[31].assetPath).toContain('level-32-ember-bridge-balance.webp');
    expect(LEVEL_BACKGROUNDS[36].assetPath).toContain('level-37-frost-mirror-arcade.webp');
    expect(LEVEL_BACKGROUNDS[37].assetPath).toContain('level-38-long-wind-threefold-terrace.webp');
    expect(LEVEL_BACKGROUNDS[38].assetPath).toContain('level-39-black-tide-blast-heart-vault.webp');
    expect(LEVEL_BACKGROUNDS[39].assetPath).toContain('level-40-myriad-feather-heaven-gate.webp');
    expect(LEVEL_BACKGROUNDS.map((background) => background.assetPath.endsWith('.webp')))
      .toEqual(Array.from({ length: LEVELS.length }, () => true));
  });

  it('keeps every level playable inside the 1200 by 675 world', () => {
    for (const level of LEVELS) {
      expect(level.targets.length, `${level.name} needs a target`).toBeGreaterThan(0);
      expect(level.shots, `${level.name} shots`).toBeGreaterThanOrEqual(3);
      expect(level.shots, `${level.name} shots`).toBeLessThanOrEqual(5);

      for (const block of level.blocks) {
        expect(block.width, `${level.name} block width`).toBeGreaterThan(0);
        expect(block.height, `${level.name} block height`).toBeGreaterThan(0);
        expect(block.x - block.width / 2, `${level.name} block left`).toBeGreaterThanOrEqual(0);
        expect(block.x + block.width / 2, `${level.name} block right`).toBeLessThanOrEqual(WORLD_WIDTH);
        expect(block.y - block.height / 2, `${level.name} block top`).toBeGreaterThanOrEqual(0);
        expect(block.y + block.height / 2, `${level.name} block bottom`).toBeLessThanOrEqual(GROUND_Y);
      }

      for (const target of level.targets) {
        const radius = 29 * (target.scale ?? 1);
        expect(target.x - radius, `${level.name} target left`).toBeGreaterThanOrEqual(0);
        expect(target.x + radius, `${level.name} target right`).toBeLessThanOrEqual(WORLD_WIDTH);
        expect(target.y - radius, `${level.name} target top`).toBeGreaterThanOrEqual(0);
        expect(target.y + radius, `${level.name} target bottom`).toBeLessThanOrEqual(GROUND_Y);
      }

      for (const platform of level.platforms ?? []) {
        expect(platform.x - platform.width / 2, `${level.name} platform left`).toBeGreaterThanOrEqual(0);
        expect(platform.x + platform.width / 2, `${level.name} platform right`).toBeLessThanOrEqual(WORLD_WIDTH);
        expect(platform.y - platform.height / 2, `${level.name} platform top`).toBeGreaterThanOrEqual(0);
        expect(platform.y + platform.height / 2, `${level.name} platform bottom`).toBeLessThanOrEqual(GROUND_Y);
      }
    }
  });

  it('adds distinct material and platform combinations across the five-level final expansion', () => {
    const newLevels = LEVELS.slice(31, 36);
    const materials = new Set<Material>(newLevels.flatMap((level) => level.blocks.map((block) => block.material)));
    const signatures = new Set(newLevels.map((level) => {
      const materialSignature = [...new Set(level.blocks.map((block) => block.material))].sort().join('+');
      const gunners = level.targets.filter((target) => target.gunner).length;
      return `${materialSignature}|blocks:${level.blocks.length}|platforms:${level.platforms?.length ?? 0}`
        + `|targets:${level.targets.length}|gunners:${gunners}`;
    }));

    expect(materials).toEqual(new Set<Material>(['wood', 'stone', 'glass']));
    expect(signatures.size).toBe(5);
    expect(newLevels.map((level) => level.shots)).toEqual(Array.from({ length: 5 }, () => 5));
    expect(newLevels.every((level) => Boolean(level.tacticalHint))).toBe(true);
  });

  it('adds four distinct mastery structures for levels thirty-seven through forty', () => {
    const newLevels = LEVELS.slice(36);
    const signatures = new Set(newLevels.map((level) => {
      const materials = [...new Set(level.blocks.map((block) => block.material))].sort().join('+');
      const gunners = level.targets.filter((target) => target.gunner).length;
      return `${materials}|blocks:${level.blocks.length}|platforms:${level.platforms?.length ?? 0}`
        + `|targets:${level.targets.length}|gunners:${gunners}`;
    }));

    expect(signatures.size).toBe(4);
    expect(newLevels.map((level) => level.shots)).toEqual(Array.from({ length: 4 }, () => 5));
    expect(newLevels.every((level) => Boolean(level.tacticalHint))).toBe(true);
  });

  it('keeps authored mastery structures separated before Matter physics starts', () => {
    const overlaps = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ): boolean => Math.min(a.x + a.width / 2, b.x + b.width / 2)
        - Math.max(a.x - a.width / 2, b.x - b.width / 2) > 1
      && Math.min(a.y + a.height / 2, b.y + b.height / 2)
        - Math.max(a.y - a.height / 2, b.y - b.height / 2) > 1;

    for (const level of LEVELS.slice(23)) {
      for (const [index, block] of level.blocks.entries()) {
        for (const other of level.blocks.slice(index + 1)) {
          expect(overlaps(block, other), `${level.name} has overlapping blocks`).toBe(false);
        }
        for (const platform of level.platforms ?? []) {
          expect(overlaps(block, platform), `${level.name} has a block inside a platform`).toBe(false);
        }
      }

      for (const target of level.targets) {
        const diameter = 58 * (target.scale ?? 1);
        const bounds = { x: target.x, y: target.y, width: diameter, height: diameter };
        for (const block of level.blocks) {
          expect(
            overlaps(bounds, block),
            `${level.name} target ${target.x},${target.y} overlaps block ${block.x},${block.y}`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps one armored target in every advanced level from level five onward', () => {
    const armorCounts = LEVELS.map((level) => level.targets.filter((target) => target.armored).length);
    expect(armorCounts.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(armorCounts.slice(4)).toEqual(Array.from({ length: 36 }, () => 1));
  });

  it('places firelock sentries only in selected tactical levels without stacking armor', () => {
    const gunnerCounts = LEVELS.map((level) => level.targets.filter((target) => target.gunner).length);
    expect(gunnerCounts).toEqual([
      0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1,
      0, 1, 0, 0, 1, 0, 1, 0, 1, 1,
      0, 0, 2, 0, 1, 0, 1, 2,
      0, 1, 0, 1, 2,
      1, 0, 1, 2,
    ]);
    expect(LEVELS.flatMap((level) => level.targets)
      .every((target) => !(target.gunner && target.armored))).toBe(true);
  });
});
