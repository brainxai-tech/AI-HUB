export type ExplanationInput = {
  idolName: string;
  userTags: string[];
  matchedTags: string[];
  entryReasons: string[];
};

export const buildFallbackExplanation = ({
  idolName,
  userTags,
  matchedTags,
  entryReasons
}: ExplanationInput) =>
  `娱乐向解读：你选择里的高频偏好是「${userTags.slice(0, 3).join("、")}」，${idolName} 命中了「${matchedTags.slice(0, 3).join("、")}」。建议先从${entryReasons.slice(0, 2).join("和")}开始补档，再判断这份上头感能不能持续。`;
