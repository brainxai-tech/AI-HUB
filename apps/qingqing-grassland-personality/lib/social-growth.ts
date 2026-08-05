import {
  dimensions,
  personalityTypes,
  type Dimension,
  type DimensionId,
  type PersonalityType
} from "../data/personality-test.ts";
import { getAnchorDistance, getDimensionPositionLabel } from "./scoring.ts";
import { getPersonalityVisualProfile } from "./result-presentation.ts";

export type RelationshipClimate = "同频回声" | "顺风同行" | "互补成景" | "需要慢慢对频";

export type RelationshipReport = {
  climate: RelationshipClimate;
  distance: number;
  summary: string;
  shared: string;
  watchOut: string;
  suggestion: string;
};

export type DailyGrasslandWeather = {
  title: string;
  forecast: string;
  action: string;
  seedDate: string;
};

export type PersonalityAtlasEntry = {
  id: string;
  name: string;
  motifLabel: string;
  toneClass: string;
  keywords: string[];
  summary: string;
  isCurrent: boolean;
};

type DimensionComparison = {
  dimension: Dimension;
  diff: number;
  selfLabel: string;
  otherLabel: string;
  sharedLabel: string;
};

const weatherPatterns = [
  {
    title: "晨露微光",
    forecast: "今天适合先把心里的草叶抖一抖，再出门接住真正重要的事。",
    action: "给自己留出十分钟安静启动。"
  },
  {
    title: "顺风小路",
    forecast: "今天的风比较顺，适合推进一件已经想了很久的小计划。",
    action: "把第一步写得很小，然后马上做。"
  },
  {
    title: "薄云观察",
    forecast: "今天适合慢一点看局势，很多答案会在细节里露出轮廓。",
    action: "先确认信息，再确认感受。"
  },
  {
    title: "日光开场",
    forecast: "今天你的存在感会更容易被看见，适合主动表达一个清楚想法。",
    action: "说重点，也留一点余地。"
  },
  {
    title: "草坡回声",
    forecast: "今天适合复盘关系里的微妙感受，有些边界说清楚会更轻松。",
    action: "把想照顾别人和想照顾自己分开看。"
  },
  {
    title: "远山定锚",
    forecast: "今天不必急着追每一阵风，稳住一个核心判断就很有力量。",
    action: "先守住最重要的一件事。"
  },
  {
    title: "夜风换气",
    forecast: "今天适合把压力说出来或写下来，让脑内天气慢慢变清。",
    action: "找一个安全的人，讲一段真实感受。"
  }
] satisfies Omit<DailyGrasslandWeather, "seedDate">[];

export function getRelationshipReport(
  self: PersonalityType,
  other: PersonalityType
): RelationshipReport {
  const distance = getAnchorDistance(self.anchor, other.anchor);
  const climate = getRelationshipClimate(distance);
  const comparisons = getDimensionComparisons(self, other);
  const closest = comparisons[0]!;
  const farthest = comparisons[comparisons.length - 1]!;

  if (distance === 0) {
    return {
      climate,
      distance,
      summary: `${self.name} 遇见另一个 ${other.name}，像同一片草坡上的回声，默契来得很快，也容易默认对方已经懂了。`,
      shared: `你们在「${closest.dimension.name}」上最容易同频，都偏向「${closest.sharedLabel}」。`,
      watchOut: "太像的时候，盲点也会互相放大；别把沉默、热情或节奏差异当成理所当然。",
      suggestion: "把默契说出来一点，关系会更稳，也更不容易靠猜。"
    };
  }

  return {
    climate,
    distance,
    summary: `${self.name} 和 ${other.name} 的草原距离是 ${distance}，整体属于「${climate}」：有可借力的地方，也有需要慢慢调频的地方。`,
    shared: `最容易接上的维度是「${closest.dimension.name}」，你们都比较靠近「${closest.sharedLabel}」。`,
    watchOut: `最需要留意「${farthest.dimension.name}」：你更像「${farthest.selfLabel}」，对方更像「${farthest.otherLabel}」。`,
    suggestion: getRelationshipSuggestion(climate)
  };
}

export function getDailyGrasslandWeather(
  personality: PersonalityType,
  date = new Date()
): DailyGrasslandWeather {
  const seedDate = getDateSeed(date);
  const weather = weatherPatterns[hashString(`${seedDate}:${personality.id}`) % weatherPatterns.length]!;
  const keyword = personality.keywords[hashString(`${personality.id}:${seedDate}:keyword`) % personality.keywords.length];

  return {
    title: weather.title,
    forecast: `${personality.name} 今日天气：${weather.forecast} 你的草原关键词是「${keyword}」。`,
    action: weather.action,
    seedDate
  };
}

export function getPersonalityAtlasEntries(currentTypeId: string): PersonalityAtlasEntry[] {
  return personalityTypes.map((type) => {
    const visualProfile = getPersonalityVisualProfile(type.id);

    return {
      id: type.id,
      name: type.name,
      motifLabel: visualProfile.motifLabel,
      toneClass: visualProfile.toneClass,
      keywords: type.keywords,
      summary: type.summary,
      isCurrent: type.id === currentTypeId
    };
  });
}

function getRelationshipClimate(distance: number): RelationshipClimate {
  if (distance === 0) {
    return "同频回声";
  }

  if (distance <= 180) {
    return "顺风同行";
  }

  if (distance <= 320) {
    return "互补成景";
  }

  return "需要慢慢对频";
}

function getRelationshipSuggestion(climate: RelationshipClimate): string {
  switch (climate) {
    case "顺风同行":
      return "你们可以直接约定一个共同目标，再把节奏和责任说清楚，默契会来得很快。";
    case "互补成景":
      return "先承认彼此节奏不同，再把一个人擅长启动、一个人擅长稳住的部分分工出来。";
    case "需要慢慢对频":
      return "不要急着证明谁更对；先从低压力的小合作开始，观察彼此的边界、速度和表达方式。";
    case "同频回声":
      return "把默契说出来一点，关系会更稳，也更不容易靠猜。";
  }
}

function getDimensionComparisons(
  self: PersonalityType,
  other: PersonalityType
): DimensionComparison[] {
  return dimensions
    .map((dimension) => {
      const selfValue = self.anchor[dimension.id];
      const otherValue = other.anchor[dimension.id];
      const sharedValue = Math.round((selfValue + otherValue) / 2);

      return {
        dimension,
        diff: Math.abs(selfValue - otherValue),
        selfLabel: getDimensionPositionLabel(dimension.id, selfValue),
        otherLabel: getDimensionPositionLabel(dimension.id, otherValue),
        sharedLabel: getDimensionPositionLabel(dimension.id, sharedValue)
      };
    })
    .sort((a, b) => a.diff - b.diff || dimensionRank(a.dimension.id) - dimensionRank(b.dimension.id));
}

function dimensionRank(dimensionId: DimensionId): number {
  return dimensions.findIndex((dimension) => dimension.id === dimensionId);
}

function getDateSeed(date: Date): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
