import { quizOptionsById } from "./quiz.ts";
import type { IdolProfile, MatchResult, UserPreferenceProfile } from "./types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const addWeight = (traits: Record<string, number>, tag: string, value: number) => {
  traits[tag] = (traits[tag] ?? 0) + value;
};

export const buildUserPreferenceProfile = (selectedOptionIds: string[]): UserPreferenceProfile => {
  const traits: Record<string, number> = {};

  for (const optionId of selectedOptionIds) {
    const option = quizOptionsById.get(optionId);
    if (!option) {
      continue;
    }

    for (const [tag, weight] of Object.entries(option.weights)) {
      addWeight(traits, tag, weight);
    }
  }

  const tags = Object.entries(traits)
    .sort(([, left], [, right]) => right - left)
    .map(([tag]) => tag);

  return {
    selectedOptionIds,
    tags,
    traits
  };
};

export const getTopUserTags = (profile: UserPreferenceProfile, limit = 8) =>
  Object.entries(profile.traits)
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit)
    .map(([tag]) => tag);

const cosineSimilarity = (left: Record<string, number>, right: Record<string, number>) => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const key of keys) {
    const leftValue = left[key] ?? 0;
    const rightValue = right[key] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const buildReasons = (
  userProfile: UserPreferenceProfile,
  idol: IdolProfile,
  matchedTags: string[]
) => {
  const topTags = getTopUserTags(userProfile, 5);
  const reasonTags = matchedTags.slice(0, 4);
  const reasons = [
    `你的高权重偏好集中在「${topTags.join("、")}」，${idol.name} 的资料画像也命中了「${reasonTags.join("、")}」。`,
    `这类匹配更适合从「${idol.entryReasons.slice(0, 2).join(" / ")}」入坑，能最快看到你在意的气质和内容形态。`
  ];

  if (matchedTags.includes("陪伴型") || matchedTags.includes("温柔")) {
    reasons.push("你需要的情绪价值不是强行鸡血，而是稳定、可反复打开的陪伴感。");
  }

  if (matchedTags.includes("舞台型") || matchedTags.includes("实力派")) {
    reasons.push("你对舞台和实力的权重较高，适合从现场、直拍和练习室内容判断是否会长期上头。");
  }

  if (matchedTags.includes("反差型")) {
    reasons.push("你对台上台下的反差比较敏感，越能刷新认知的物料越容易成为入坑点。");
  }

  return reasons;
};

const dimensionTagGroups = {
  舞台: ["舞台型", "实力派", "热血"],
  作品: ["演员型", "作品型", "创作型", "综艺型"],
  陪伴: ["陪伴型", "温柔", "饭圈互动型"],
  审美: ["清冷", "甜酷", "明媚", "高级感"],
  参与: ["数据型", "线下应援型", "收藏型", "消费支持型", "安利型"]
} as const;

const buildDimensionScores = (userProfile: UserPreferenceProfile, idol: IdolProfile) =>
  Object.entries(dimensionTagGroups)
    .map(([label, tags]) => {
      const matchedTags = tags.filter(
        (tag) => (userProfile.traits[tag] ?? 0) > 0 && (idol.traits[tag] ?? 0) > 0
      );
      const score = matchedTags.reduce(
        (total, tag) => total + Math.min(userProfile.traits[tag] ?? 0, idol.traits[tag] ?? 0),
        0
      );

      return { label, score, matchedTags };
    })
    .sort((left, right) => right.score - left.score);

export const matchIdols = (
  userProfile: UserPreferenceProfile,
  idols: IdolProfile[]
): MatchResult[] => {
  const userTags = new Set(userProfile.tags);

  return idols
    .map((idol, index) => {
      const matchedTags = idol.tags.filter((tag) => userTags.has(tag));
      const traitSimilarity = cosineSimilarity(userProfile.traits, idol.traits);
      const tagSimilarity =
        matchedTags.length / Math.max(1, Math.min(userProfile.tags.length, idol.tags.length));
      const score = Math.round(clamp((traitSimilarity * 0.78 + tagSimilarity * 0.22) * 100, 0, 99));
      const dimensionScores = buildDimensionScores(userProfile, idol);
      const confidence = Math.round(
        clamp(score * 0.7 + Math.min(100, matchedTags.length * 8) * 0.3, 0, 100)
      );

      return {
        idol,
        score,
        confidence,
        matchedTags,
        reasons: buildReasons(userProfile, idol, matchedTags),
        dimensionScores,
        tieBreaker: index
      };
    })
    .sort((left, right) => right.score - left.score || left.tieBreaker - right.tieBreaker)
    .map((result) => ({
      idol: result.idol,
      score: result.score,
      confidence: result.confidence,
      matchedTags: result.matchedTags,
      reasons: result.reasons,
      dimensionScores: result.dimensionScores
    }));
};
