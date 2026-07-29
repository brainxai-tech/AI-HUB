export type BirdId = 'scarlet' | 'iron' | 'gale' | 'verdant';
export type BirdAbility = 'precision-strike' | 'impact-blast' | 'auto-split' | 'first-obstacle-phase';
export type BirdImpactCue = 'impact-scarlet' | 'impact-iron' | 'impact-gale' | 'impact-verdant';
export type FutureBirdId = 'violet' | 'frost';
export type FutureBirdAbility = 'magnetic-yank' | 'target-return';

export interface BirdVelocity {
  x: number;
  y: number;
}

export interface BirdCodexSpec {
  id: string;
  name: string;
  role: string;
  description: string;
  assetPath: string;
  abilityName: string;
  abilityHint: string;
  activatedHint: string;
  color: string;
  darkColor: string;
  burstColor: number;
  launchMultiplier: number;
  density: number;
  impactMultiplier: number;
  stats: {
    power: number;
    arc: number;
    control: number;
  };
  releaseChapter?: number;
  unlockRequirement?: string;
}

export interface BirdSpec extends BirdCodexSpec {
  id: BirdId;
  spriteSize: number;
  ability: BirdAbility;
  impactCue: BirdImpactCue;
}

export interface FutureBirdSpec extends BirdCodexSpec {
  id: FutureBirdId;
  ability: FutureBirdAbility;
  releaseChapter: 2;
  unlockRequirement: string;
}

export const DEFAULT_BIRD_ID: BirdId = 'scarlet';

export const BIRD_SPECS: BirdSpec[] = [
  {
    id: 'scarlet',
    name: '赤羽先锋',
    role: '精准破点',
    description: '保持稳定弹道；命中障碍中心线时自动精准破点，提升伤害并获得额外分数。',
    assetPath: assetUrl('assets/birds/scarlet.png'),
    spriteSize: 88,
    ability: 'precision-strike',
    abilityName: '精准破点',
    abilityHint: '瞄准障碍中心线 · 精准命中强化伤害',
    activatedHint: '精准破点！· 伤害提升并获得额外分数',
    color: '#f05b4f',
    darkColor: '#b93645',
    burstColor: 0xffd166,
    impactCue: 'impact-scarlet',
    launchMultiplier: 1,
    density: 0.001,
    impactMultiplier: 1,
    stats: { power: 4, arc: 3, control: 5 },
  },
  {
    id: 'iron',
    name: '铁喙重炮',
    role: '范围爆破',
    description: '身体更重、弹道更低；飞出弹弓安全区后，首次撞击会自动引爆周围结构。',
    assetPath: assetUrl('assets/birds/iron.png'),
    spriteSize: 96,
    ability: 'impact-blast',
    abilityName: '撞击爆破',
    abilityHint: '飞出发射安全区后 · 首次撞击自动爆炸',
    activatedHint: '爆破已触发 · 冲击附近结构',
    color: '#9aa1b4',
    darkColor: '#565d73',
    burstColor: 0xbcc4d9,
    impactCue: 'impact-iron',
    launchMultiplier: 0.86,
    density: 0.00165,
    impactMultiplier: 1.45,
    stats: { power: 5, arc: 2, control: 4 },
  },
  {
    id: 'gale',
    name: '风翎游侠',
    role: '空中分裂',
    description: '进入战场或接近目标后，在当前位置短暂停顿并展开成三只小鸟；慢速飞行最迟 1 秒触发。',
    assetPath: assetUrl('assets/birds/gale.png'),
    spriteSize: 92,
    ability: 'auto-split',
    abilityName: '三羽分裂',
    abilityHint: '进入战场或接近目标自动同点三分裂 · 无需点击',
    activatedHint: '同点展开完成 · 三只小鸟继续飞行',
    color: '#78d6c5',
    darkColor: '#288c82',
    burstColor: 0x78d6c5,
    impactCue: 'impact-gale',
    launchMultiplier: 1.08,
    density: 0.00072,
    impactMultiplier: 0.82,
    stats: { power: 2, arc: 5, control: 5 },
  },
  {
    id: 'verdant',
    name: '翠影穿梭',
    role: '首障穿透',
    description: '首次撞到建筑障碍时自动无伤直穿；该障碍不会受伤，穿出后恢复碰撞。',
    assetPath: assetUrl('assets/birds/verdant.png'),
    spriteSize: 90,
    ability: 'first-obstacle-phase',
    abilityName: '翠影相位',
    abilityHint: '首个建筑障碍无伤直穿 · 该障碍不受伤',
    activatedHint: '相位启动 · 本次障碍不会受伤',
    color: '#7fd25a',
    darkColor: '#27704f',
    burstColor: 0x8cff74,
    impactCue: 'impact-verdant',
    launchMultiplier: 1.04,
    density: 0.00088,
    impactMultiplier: 0.95,
    stats: { power: 3, arc: 4, control: 5 },
  },
];

export const FUTURE_BIRD_SPECS: FutureBirdSpec[] = [
  {
    id: 'violet',
    name: '紫钩工兵',
    role: '结构牵引',
    description: '首次撞到非地基构件时自动张开磁索，在 0.45 秒内将它向弹弓方向回拽后脱钩；擅长把悬梁、塔顶与外伸支架反向扯倒。',
    assetPath: assetUrl('assets/birds/violet.png'),
    ability: 'magnetic-yank',
    abilityName: '磁索回拽',
    abilityHint: '首次命中非地基构件 · 自动向弹弓方向回拽',
    activatedHint: '磁索锁定 · 结构正在反向位移',
    color: '#8b3fc6',
    darkColor: '#4b216f',
    burstColor: 0xc964ff,
    launchMultiplier: 0.98,
    density: 0.00105,
    impactMultiplier: 0.72,
    stats: { power: 2, arc: 3, control: 5 },
    releaseChapter: 2,
    unlockRequirement: '第二章第 8 关首次通关',
  },
  {
    id: 'frost',
    name: '霜翎猎手',
    role: '折返锁敌',
    description: '飞过首个存活目标后自动折返一次，短暂锁定最近目标并从背面俯冲；折返只修正方向，不附带穿透或范围爆炸。',
    assetPath: assetUrl('assets/birds/frost.png'),
    ability: 'target-return',
    abilityName: '霜轨折返',
    abilityHint: '越过首个目标自动折返 · 锁定最近目标背面',
    activatedHint: '霜轨锁定 · 正在折返追击',
    color: '#38bce8',
    darkColor: '#28629e',
    burstColor: 0x8cecff,
    launchMultiplier: 1.12,
    density: 0.00068,
    impactMultiplier: 1.08,
    stats: { power: 3, arc: 5, control: 3 },
    releaseChapter: 2,
    unlockRequirement: '第二章累计获得 30 颗星',
  },
];

export const ALL_BIRD_CODEX_SPECS: BirdCodexSpec[] = [...BIRD_SPECS, ...FUTURE_BIRD_SPECS];

export const BIRD_RECOMMENDATIONS: BirdId[] = [
  'scarlet',
  'gale',
  'verdant',
  'verdant',
  'iron',
  'verdant',
  'gale',
  'scarlet',
  'verdant',
  'scarlet',
  'gale',
  'iron',
  'scarlet',
  'verdant',
  'gale',
  'scarlet',
  'iron',
  'verdant',
  'verdant',
  'scarlet',
  'gale',
  'iron',
  'scarlet',
  'verdant',
  'gale',
  'scarlet',
  'iron',
  'verdant',
  'gale',
  'iron',
  'scarlet',
  'scarlet',
  'verdant',
  'gale',
  'iron',
  'scarlet',
  'verdant',
  'gale',
  'iron',
  'scarlet',
];

const BIRDS_BY_ID = Object.fromEntries(BIRD_SPECS.map((bird) => [bird.id, bird])) as Record<BirdId, BirdSpec>;

export function resolveBirdId(birdId: string | undefined): BirdId {
  return birdId === 'iron' || birdId === 'gale' || birdId === 'scarlet' || birdId === 'verdant'
    ? birdId
    : DEFAULT_BIRD_ID;
}

export function getBirdSpec(birdId: string | undefined): BirdSpec {
  return BIRDS_BY_ID[resolveBirdId(birdId)];
}

export function computeLaunchVelocity(birdId: string, pull: BirdVelocity): BirdVelocity {
  const multiplier = getBirdSpec(birdId).launchMultiplier;
  return {
    x: pull.x * 0.15 * multiplier,
    y: pull.y * 0.15 * multiplier,
  };
}
import { assetUrl } from '../assets';
