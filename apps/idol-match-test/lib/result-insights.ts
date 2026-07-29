import type { IdolProfile, MatchResult } from "./types";

export type TopCandidateInsight = {
  idolId: string;
  rank: number;
  summary: string;
  uniqueTags: string[];
};

export type EntryPathCard = {
  step: string;
  title: string;
  action: string;
  detail: string;
};

const fallbackEntryReasons = ["代表舞台/作品", "近期高热物料", "采访或直播切片"];

const getStrongestDimension = (match: MatchResult) =>
  match.dimensionScores.find((item) => item.score > 0)?.label ?? "综合偏好";

export const buildTopCandidateInsights = (matches: MatchResult[]): TopCandidateInsight[] => {
  const leader = matches[0];

  return matches.slice(0, 3).map((match, index) => {
    const uniqueTags =
      index === 0 || !leader
        ? match.matchedTags.slice(0, 3)
        : match.matchedTags.filter((tag) => !leader.matchedTags.includes(tag)).slice(0, 3);
    const strongestDimension = getStrongestDimension(match);

    if (index === 0 || !leader) {
      return {
        idolId: match.idol.id,
        rank: index + 1,
        uniqueTags,
        summary: `综合命中最高，最强维度是「${strongestDimension}」，适合作为主入坑对象。`
      };
    }

    const scoreGap = Math.max(0, leader.score - match.score);
    const uniqueCopy =
      uniqueTags.length > 0 ? `，更突出「${uniqueTags.join("、")}」` : "，偏好重合度接近";
    const closenessCopy =
      scoreGap <= 3 ? `只比 TOP1 低 ${scoreGap} 分` : `比 TOP1 低 ${scoreGap} 分`;

    return {
      idolId: match.idol.id,
      rank: index + 1,
      uniqueTags,
      summary: `${closenessCopy}${uniqueCopy}，可作为${strongestDimension}向备选。`
    };
  });
};

export const buildEntryPathCards = (idol: IdolProfile, generatedReasons: string[] = []): EntryPathCard[] => {
  const reasons =
    generatedReasons.length > 0
      ? generatedReasons
      : idol.entryReasons.length > 0
        ? idol.entryReasons
        : fallbackEntryReasons;
  const firstReason = reasons[0] ?? fallbackEntryReasons[0];
  const secondReason = reasons[1] ?? reasons[0] ?? fallbackEntryReasons[1];
  const thirdReason = reasons[2] ?? reasons[1] ?? reasons[0] ?? fallbackEntryReasons[2];

  return [
    {
      step: "01",
      title: "先看高光",
      action: firstReason,
      detail: `用一条最强物料判断你会不会对 ${idol.name} 的核心气质上头。`
    },
    {
      step: "02",
      title: "补代表作",
      action: secondReason,
      detail: "把舞台、作品或角色补到同一条线上，看偏好是不是能持续。"
    },
    {
      step: "03",
      title: "看日常反差",
      action: thirdReason,
      detail: "再看采访、直播或综艺切片，确认长期陪伴感和新鲜感。"
    }
  ];
};

export const getDimensionPercent = (score: number, maxScore: number) => {
  if (score <= 0 || maxScore <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(8, Math.round((score / maxScore) * 100)));
};
