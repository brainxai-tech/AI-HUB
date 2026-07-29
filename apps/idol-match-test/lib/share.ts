export type ShareTextInput = {
  modeName: string;
  idolName: string;
  score: number;
  tags: string[];
};

export const buildShareText = ({ modeName, idolName, score, tags }: ShareTextInput) =>
  `我的爱豆匹配测试${modeName}结果：${idolName}，${score}分。关键词：${tags.slice(0, 3).join(" / ")}。`;

export type SharePosterInput = ShareTextInput & {
  confidence: number;
  topReasons: string[];
};

export const buildSharePosterLines = ({
  modeName,
  idolName,
  score,
  confidence,
  tags,
  topReasons
}: SharePosterInput) => [
  "爱豆匹配测试",
  `${modeName}结果：${idolName}`,
  `匹配分 ${score} · 置信度 ${confidence}%`,
  `关键词：${tags.slice(0, 4).join(" / ") || "偏好路径较分散"}`,
  `入坑点：${topReasons.slice(0, 2).join(" / ") || "先看代表物料"}`
];

export const buildPosterFilename = (idolName: string, modeName: string) => {
  const safeIdolName = idolName.replace(/[\\/:*?"<>|]/g, "").trim() || "idol";
  const safeModeName = modeName.replace(/[\\/:*?"<>|]/g, "").trim() || "match";

  return `idol-match-${safeModeName}-${safeIdolName}.png`;
};
