export const TARGET_ART = {
  id: 'moss-snout',
  name: '苔鼻盗贼',
  assetPath: assetUrl('assets/targets/moss-snout.png'),
  textureKey: 'enemy-pig-art-moss-snout',
  spriteSize: 82,
  collisionRadius: 29,
} as const;

export const ARMORED_TARGET_ART = {
  id: 'moss-snout-helmet',
  name: '铁盔苔鼻',
  assetPath: assetUrl('assets/targets/moss-snout-helmet.png'),
  textureKey: 'enemy-pig-art-moss-snout-helmet',
  spriteSize: 82,
  collisionRadius: 29,
} as const;

export const GUNNER_TARGET_ART = {
  id: 'moss-snout-gunner',
  name: '火铳哨兵',
  assetPath: assetUrl('assets/targets/moss-snout-gunner.png'),
  textureKey: 'enemy-pig-art-moss-snout-gunner',
  spriteSize: 88,
  collisionRadius: 29,
} as const;

export interface TargetProfile {
  id: string;
  name: string;
  role: string;
  assetPath: string;
  color: string;
  stats: string;
  trait: string;
  skillName: string;
  skillDescription: string;
}

export const TARGET_PROFILES: TargetProfile[] = [
  {
    id: TARGET_ART.id,
    name: TARGET_ART.name,
    role: '基础守卫',
    assetPath: TARGET_ART.assetPath,
    color: '#78a94f',
    stats: '生命 15 · 护甲 0 · 威胁 1 / 5',
    trait: '没有额外防护，通常依靠木、玻璃与石材堡垒承受冲击；直接撞击或坠落都能造成伤害。',
    skillName: '无主动技能',
    skillDescription: '不会反击，弱点是暴露站位与被破坏后的承重结构。',
  },
  {
    id: ARMORED_TARGET_ART.id,
    name: ARMORED_TARGET_ART.name,
    role: '装甲守卫',
    assetPath: ARMORED_TARGET_ART.assetPath,
    color: '#718092',
    stats: '生命 15 · 护甲 1 次 · 威胁 3 / 5',
    trait: '碰撞体与普通苔鼻相同，但头盔会完整吸收第一次有效伤害，破甲后恢复普通状态。',
    skillName: '铁盔格挡',
    skillDescription: '首次有效命中只击碎头盔且不扣生命；必须再次命中或制造二次坠落才能击败。',
  },
  {
    id: GUNNER_TARGET_ART.id,
    name: GUNNER_TARGET_ART.name,
    role: '远程哨兵',
    assetPath: GUNNER_TARGET_ART.assetPath,
    color: '#d47a45',
    stats: '生命 15 · 每发拦截 1 次 · 威胁 4 / 5',
    trait: '没有头盔，但会对每枚进入战场的怒羽进行一次可见锁定；锁定期间被击倒就会中断射击。',
    skillName: '火铳拦截',
    skillDescription: '锁定完成后必定开火：所有怒羽偏转 22.5° 并保留 92% 速度，但不会被火铳直接引爆；下一发怒羽出现时重新装填。',
  },
];

export interface TargetArtOptions {
  armored?: boolean;
  gunner?: boolean;
}

export function getTargetArt(
  options: TargetArtOptions = {},
): typeof TARGET_ART | typeof ARMORED_TARGET_ART | typeof GUNNER_TARGET_ART {
  if (options.gunner) return GUNNER_TARGET_ART;
  return options.armored ? ARMORED_TARGET_ART : TARGET_ART;
}
import { assetUrl } from '../assets';
