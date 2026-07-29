import type { PersonalityType } from "../data/personality-test.ts";

export type PersonalityVisualProfile = {
  motifLabel: string;
  terrainLine: string;
  toneClass: string;
  stampText: string;
};

const fallbackProfile: PersonalityVisualProfile = {
  motifLabel: "草原风向",
  terrainLine: "一段正在被风慢慢读懂的自我轮廓。",
  toneClass: "tone-meadow",
  stampText: "草原"
};

const visualProfiles: Record<string, PersonalityVisualProfile> = {
  "morning-dew-grass": {
    motifLabel: "晨露 / 草叶",
    terrainLine: "低声、清亮、贴近心事的湿润地带。",
    toneClass: "tone-dew",
    stampText: "晨露"
  },
  "grassland-sun": {
    motifLabel: "日光 / 开阔",
    terrainLine: "亮起来的地方，常常也被你带动起来。",
    toneClass: "tone-sun",
    stampText: "太阳"
  },
  "wind-vane": {
    motifLabel: "风向 / 机敏",
    terrainLine: "风一转，你就能听见局势的轻响。",
    toneClass: "tone-wind",
    stampText: "风向"
  },
  "haystack-fortress": {
    motifLabel: "草垛 / 堡垒",
    terrainLine: "厚实、温暖，适合让慌乱先落地。",
    toneClass: "tone-hay",
    stampText: "草垛"
  },
  "distant-mountain-solo": {
    motifLabel: "远山 / 独行",
    terrainLine: "距离不是冷淡，是你确认方向的方式。",
    toneClass: "tone-mountain",
    stampText: "远山"
  },
  "campfire-center": {
    motifLabel: "篝火 / 聚合",
    terrainLine: "靠近你时，人会想起被照亮的晚上。",
    toneClass: "tone-fire",
    stampText: "篝火"
  },
  "thunderstorm-charge": {
    motifLabel: "雷雨 / 冲锋",
    terrainLine: "能量来得很快，也真的能推开云层。",
    toneClass: "tone-storm",
    stampText: "雷雨"
  },
  "cloud-dreamer": {
    motifLabel: "云朵 / 想象",
    terrainLine: "你把普通天空，折成很多可能的形状。",
    toneClass: "tone-cloud",
    stampText: "云朵"
  },
  "herd-bell-order": {
    motifLabel: "牧铃 / 秩序",
    terrainLine: "清楚的节奏，是你给混乱系上的铃。",
    toneClass: "tone-bell",
    stampText: "牧铃"
  },
  "stream-repair": {
    motifLabel: "小溪 / 修复",
    terrainLine: "你擅长让紧绷的东西慢慢有了水声。",
    toneClass: "tone-stream",
    stampText: "小溪"
  },
  "grass-seed-latent": {
    motifLabel: "草籽 / 潜伏",
    terrainLine: "安静不是停下，是把根往深处放。",
    toneClass: "tone-seed",
    stampText: "草籽"
  },
  "starry-night-watch": {
    motifLabel: "星夜 / 守护",
    terrainLine: "你常在别人没发现时，先替重要之物点灯。",
    toneClass: "tone-night",
    stampText: "星夜"
  },
  "wildflower-expression": {
    motifLabel: "野花 / 表达",
    terrainLine: "鲜明不是任性，是生命力有自己的颜色。",
    toneClass: "tone-flower",
    stampText: "野花"
  },
  "long-slope-observer": {
    motifLabel: "长坡 / 观察",
    terrainLine: "你不急着抵达，因为你想看清整片地势。",
    toneClass: "tone-slope",
    stampText: "长坡"
  },
  "warm-breeze-social": {
    motifLabel: "暖风 / 社交",
    terrainLine: "你经过的地方，尴尬通常会松一点。",
    toneClass: "tone-breeze",
    stampText: "暖风"
  },
  "stone-anchor": {
    motifLabel: "石头 / 定海",
    terrainLine: "安静有分量，原则也有自己的温度。",
    toneClass: "tone-stone",
    stampText: "石头"
  },
  "rainbow-mediator": {
    motifLabel: "彩虹 / 调停",
    terrainLine: "你让对立的人，重新看见同一片天空。",
    toneClass: "tone-rainbow",
    stampText: "彩虹"
  },
  "grassland-scout": {
    motifLabel: "侦察 / 线索",
    terrainLine: "你听见细节里藏着的机会和异常。",
    toneClass: "tone-scout",
    stampText: "侦察"
  },
  "swift-wind-adventurer": {
    motifLabel: "疾风 / 冒险",
    terrainLine: "未知不是阻碍，更像邀请你起跑的信号。",
    toneClass: "tone-swift",
    stampText: "疾风"
  },
  "moonlight-boundary": {
    motifLabel: "月光 / 边界",
    terrainLine: "你把距离照亮，让关系保留清醒的美。",
    toneClass: "tone-moon",
    stampText: "月光"
  }
};

export function getPersonalityVisualProfile(typeId: string): PersonalityVisualProfile {
  return visualProfiles[typeId] ?? fallbackProfile;
}

export function buildShareText(type: PersonalityType): string {
  return [
    `我的青青草原型人格是「${type.name}」`,
    `关键词：${type.keywords.join(" / ")}`,
    type.summary,
    `今日草原提醒：${type.dailyAdvice}`,
    "（娱乐自测，不是心理诊断。）"
  ].join("｜");
}

export function getDimensionMarkerPosition(value: number): string {
  const clamped = clampDimensionScore(value);
  return `${Math.round((clamped + 100) / 2)}%`;
}

export function getDimensionNeedleRotation(value: number): string {
  const clamped = clampDimensionScore(value);
  return `${Math.round(clamped * 0.72)}deg`;
}

function clampDimensionScore(value: number): number {
  return Math.max(-100, Math.min(100, value));
}
