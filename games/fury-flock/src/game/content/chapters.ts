import { LEVELS } from './levels';

export interface ChapterActSpec {
  name: string;
  subtitle: string;
  startLevelIndex: number;
  endLevelIndex: number;
}

export interface ChapterSpec {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  description: string;
  coverLevelIndex: number;
  levelIndexes: readonly number[];
  acts: readonly ChapterActSpec[];
}

export const CHAPTERS: readonly ChapterSpec[] = [
  {
    id: 'chapter-1-muyun-siege',
    number: 1,
    name: '暮云破城',
    subtitle: '从木桥前哨一路攻上万羽天门',
    description: '四十座不重复的堡垒串成一场完整远征：试翼、破阵、深入地宫，最后在天门前完成总攻。',
    coverLevelIndex: 39,
    levelIndexes: LEVELS.map((_, index) => index),
    acts: [
      { name: '前哨试翼', subtitle: '承重点与基础连锁', startLevelIndex: 0, endLevelIndex: 7 },
      { name: '云城迷阵', subtitle: '穿透、分裂与机关', startLevelIndex: 8, endLevelIndex: 15 },
      { name: '王城风暴', subtitle: '多路线复合堡垒', startLevelIndex: 16, endLevelIndex: 23 },
      { name: '地宫回响', subtitle: '火铳、装甲与爆心', startLevelIndex: 24, endLevelIndex: 31 },
      { name: '天门终局', subtitle: '五条收束路线决战', startLevelIndex: 32, endLevelIndex: 39 },
    ],
  },
];

export const FIRST_CHAPTER = CHAPTERS[0];
