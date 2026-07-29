import {
  dimensions as allDimensions,
  personalityTypes,
  type Dimension,
  type DimensionId,
  type DimensionVector,
  type PersonalityType
} from "../data/personality-test.ts";
import { getAnchorDistance, getDimensionPositionLabel, type PersonalityMatch } from "./scoring.ts";
import type { PersonalityVisualProfile } from "./result-presentation.ts";

export type DimensionInsight = {
  dimensionId: DimensionId;
  name: string;
  label: string;
  description: string;
  suggestion: string;
};

export type ShareCardStyleId = "classic" | "field-note" | "night-wind";

export type ShareCardStyle = {
  id: ShareCardStyleId;
  name: string;
  description: string;
  label: string;
  backgroundStart: string;
  backgroundMiddle: string;
  backgroundEnd: string;
  meadowFront: string;
  meadowBack: string;
  accent: string;
};

export type ShareCardInput = {
  personality: PersonalityType;
  visualProfile: PersonalityVisualProfile;
  scores: DimensionVector;
  modeLabel: string;
  dimensions?: Dimension[];
  styleId?: ShareCardStyleId;
};

export type AtlasCardInput = {
  personality: PersonalityType;
  visualProfile: PersonalityVisualProfile;
  isCurrent?: boolean;
};

export const shareCardStyles: ShareCardStyle[] = [
  {
    id: "classic",
    name: "清晨草原",
    description: "柔和、治愈，适合默认结果分享。",
    label: "classic",
    backgroundStart: "#e8f4df",
    backgroundMiddle: "#fffdf5",
    backgroundEnd: "#f7e9bd",
    meadowFront: "#9fc681",
    meadowBack: "#cfe5bb",
    accent: "#376f47"
  },
  {
    id: "field-note",
    name: "手帐札记",
    description: "像夹在风里的测试小票，更适合朋友圈长图。",
    label: "field-note",
    backgroundStart: "#f6efd7",
    backgroundMiddle: "#fffaf0",
    backgroundEnd: "#dceacb",
    meadowFront: "#b7c98d",
    meadowBack: "#e7d6a8",
    accent: "#9a6238"
  },
  {
    id: "night-wind",
    name: "夜风星图",
    description: "沉静一点的夜间草原，适合边界感更强的结果。",
    label: "night-wind",
    backgroundStart: "#dbe9ed",
    backgroundMiddle: "#fffdf5",
    backgroundEnd: "#d8e1c2",
    meadowFront: "#7aa070",
    meadowBack: "#afc9bd",
    accent: "#35515a"
  }
];

const dimensionCopy: Record<
  DimensionId,
  {
    negative: string;
    positive: string;
    balanced: string;
    negativeSuggestion: string;
    positiveSuggestion: string;
    balancedSuggestion: string;
  }
> = {
  SE: {
    negative: "你的社交能量更像先回到安静处蓄电，观察够了再慢慢靠近。",
    positive: "你的社交能量更容易在人群里被点亮，也常常能带动现场的温度。",
    balanced: "你的社交能量比较弹性，既能独处回血，也能在合适的群体里发光。",
    negativeSuggestion: "给自己保留离场和独处的余地，会让连接更舒服。",
    positiveSuggestion: "发光很好，也记得给自己安排一点安静的回充时间。",
    balancedSuggestion: "根据当天能量选择社交密度，不必固定成一种样子。"
  },
  AC: {
    negative: "你的行动方式偏稳扎稳打，喜欢先看清路径、资源和节奏。",
    positive: "你的行动方式偏灵感冲刺，有想法时更愿意先动起来再修正。",
    balanced: "你的行动方式比较弹性，能计划，也能在机会出现时临场推进。",
    negativeSuggestion: "计划已经足够清楚时，可以允许自己先迈出一个小步。",
    positiveSuggestion: "冲刺之前留一个收尾清单，会让灵感更容易变成果实。",
    balancedSuggestion: "把大事拆成可计划的部分，把新鲜感留给探索部分。"
  },
  RB: {
    negative: "你的关系策略偏照顾融合，容易先感受到别人需要什么。",
    positive: "你的关系策略偏边界清醒，亲近也希望彼此保留清楚空间。",
    balanced: "你的关系策略比较弹性，既能照顾关系，也知道边界的重要。",
    negativeSuggestion: "照顾别人之前，先确认这是不是你真的愿意承担的部分。",
    positiveSuggestion: "边界说清楚之后，也可以补一句你的在意和善意。",
    balancedSuggestion: "需要亲近时靠近，需要空间时说明，关系会更轻。"
  },
  RV: {
    negative: "你的风险偏好偏谨慎避坑，面对未知时会先找备用方案。",
    positive: "你的风险偏好偏先冲再说，更怕错过机会，而不是害怕失败。",
    balanced: "你的风险偏好比较弹性，会看机会大小和代价，再决定速度。",
    negativeSuggestion: "把最坏情况写小一点，可能会发现有些机会值得试。",
    positiveSuggestion: "冲之前定一个止损线，会让冒险更有底气。",
    balancedSuggestion: "继续保留判断力，也别让完美安全感拖慢所有机会。"
  },
  EE: {
    negative: "你的情绪表达偏自我消化，感受上来时会先在心里整理。",
    positive: "你的情绪表达偏外放表达，说出来、聊出来，反而更容易看清楚。",
    balanced: "你的情绪表达比较弹性，能自己消化，也能在需要时表达。",
    negativeSuggestion: "不用一次表达全部，先说一点真实感受也算表达。",
    positiveSuggestion: "表达很珍贵，也可以给对方一点接住信息的时间。",
    balancedSuggestion: "为重要情绪选择合适的人和时机，表达会更有力量。"
  }
};

export function getClosestPersonalityMatches(
  scores: DimensionVector,
  limit = 3
): PersonalityMatch[] {
  return personalityTypes
    .map((type) => ({
      ...type,
      distance: getAnchorDistance(scores, type.anchor)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(0, limit));
}

export function getDimensionInsight(dimensionId: DimensionId, value: number): DimensionInsight {
  const dimension = allDimensions.find((item) => item.id === dimensionId);
  const copy = dimensionCopy[dimensionId];
  const label = getDimensionPositionLabel(dimensionId, value);

  if (!dimension) {
    return {
      dimensionId,
      name: dimensionId,
      label,
      description: "这个维度暂时没有解释。",
      suggestion: "先把它当作一个观察入口。"
    };
  }

  if (value <= -18) {
    return {
      dimensionId,
      name: dimension.name,
      label,
      description: `${dimension.name}：${copy.negative}`,
      suggestion: copy.negativeSuggestion
    };
  }

  if (value >= 18) {
    return {
      dimensionId,
      name: dimension.name,
      label,
      description: `${dimension.name}：${copy.positive}`,
      suggestion: copy.positiveSuggestion
    };
  }

  return {
    dimensionId,
    name: dimension.name,
    label,
    description: `${dimension.name}：${copy.balanced}`,
    suggestion: copy.balancedSuggestion
  };
}

export function buildShareCardFilename(personalityName: string, styleId?: ShareCardStyleId): string {
  const safeName = personalityName.replace(/[\\/:*?"<>|]/g, "").trim() || "草原人格";
  return `qingqing-${safeName}${styleId ? `-${styleId}` : ""}.png`;
}

export function buildShareCardSvg({
  personality,
  visualProfile,
  scores,
  modeLabel,
  dimensions = allDimensions,
  styleId = "classic"
}: ShareCardInput): string {
  const width = 1080;
  const height = 1440;
  const style = getShareCardStyle(styleId);
  const escapedName = escapeXml(personality.name);
  const summaryLines = wrapText(personality.summary, 24).slice(0, 4);
  const adviceLines = wrapText(personality.dailyAdvice, 26).slice(0, 2);
  const keywordText = personality.keywords.map(escapeXml).join(" / ");
  const dimensionRows = dimensions.map((dimension, index) => {
    const value = scores[dimension.id];
    const x = 130;
    const y = 850 + index * 76;
    const markerX = 560 + value * 2.2;

    return `
      <text x="${x}" y="${y}" class="dimension-name">${escapeXml(dimension.name)}</text>
      <rect x="360" y="${y - 20}" width="460" height="14" rx="7" fill="#e6ead7"/>
      <rect x="585" y="${y - 20}" width="2" height="14" fill="#adc1ad"/>
      <circle cx="${markerX}" cy="${y - 13}" r="18" fill="#1f4731" stroke="#fffdf5" stroke-width="8"/>
      <text x="865" y="${y}" class="dimension-score">${value > 0 ? `+${value}` : value}</text>
    `;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-style="${style.id}">
  <metadata>qingqing-share-card:${style.id}</metadata>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${style.backgroundStart}"/>
      <stop offset="48%" stop-color="${style.backgroundMiddle}"/>
      <stop offset="100%" stop-color="${style.backgroundEnd}"/>
    </linearGradient>
    <linearGradient id="meadow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1f4731"/>
      <stop offset="100%" stop-color="#7fa85a"/>
    </linearGradient>
    <style>
      .sans { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
      .serif { font-family: "Noto Serif SC", "Songti SC", serif; }
      .eyebrow { font: 800 30px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: ${style.accent}; }
      .mode { font: 800 26px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #b96c21; }
      .title { font: 900 86px "Noto Serif SC", "Songti SC", serif; fill: #20332c; }
      .motif { font: 900 34px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: ${style.accent}; }
      .body { font: 500 34px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #2b453b; }
      .keyword { font: 900 30px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #1f4731; }
      .dimension-name { font: 850 28px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #20332c; }
      .dimension-score { font: 900 28px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #1f4731; text-anchor: end; }
      .small { font: 700 24px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #607269; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <path d="M0 1160 C240 1090 390 1165 560 1115 C760 1058 920 1120 1080 1065 L1080 1440 L0 1440 Z" fill="${style.meadowBack}"/>
  <path d="M0 1230 C230 1185 410 1240 610 1202 C820 1160 940 1215 1080 1180 L1080 1440 L0 1440 Z" fill="${style.meadowFront}" opacity="0.75"/>
  <rect x="64" y="64" width="952" height="1220" rx="42" fill="#fffdf5" opacity="0.9" stroke="#c9d8c2" stroke-width="3"/>
  <text x="126" y="150" class="eyebrow">青青草原型人格测试器</text>
  <text x="126" y="202" class="mode">${escapeXml(modeLabel)}</text>
  <text x="780" y="202" class="mode">${escapeXml(style.label)}</text>
  <text x="126" y="330" class="title">${escapedName}</text>
  <text x="126" y="390" class="motif">${escapeXml(visualProfile.motifLabel)}</text>
  <rect x="126" y="430" width="828" height="88" rx="44" fill="#edf7ed" stroke="#c9d8c2"/>
  <text x="168" y="486" class="keyword">${keywordText}</text>
  ${summaryLines.map((line, index) => `<text x="126" y="${595 + index * 48}" class="body">${escapeXml(line)}</text>`).join("")}
  <rect x="126" y="710" width="828" height="78" rx="18" fill="#f7f1dc" stroke="#e1d4a5"/>
  <text x="166" y="760" class="small">今日草原提醒：${escapeXml(adviceLines.join(""))}</text>
  <text x="126" y="820" class="eyebrow">五维风向</text>
  ${dimensionRows}
  <line x1="126" y1="1240" x2="954" y2="1240" stroke="#d4dfc8" stroke-width="3"/>
  <text x="126" y="1306" class="small">娱乐自测，不是心理诊断。扫码分享时，也记得给朋友留一点风。</text>
  <text x="126" y="1362" class="small">qingqing-grassland-personality.vercel.app</text>
</svg>`;
}

export function buildAtlasCardFilename(personalityName: string): string {
  const safeName = personalityName.replace(/[\\/:*?"<>|]/g, "").trim() || "草原图鉴";
  return `qingqing-atlas-${safeName}.png`;
}

export function buildAtlasCardSvg({
  personality,
  visualProfile,
  isCurrent = false
}: AtlasCardInput): string {
  const width = 900;
  const height = 1200;
  const keywordText = personality.keywords.slice(0, 4).map(escapeXml).join(" / ");
  const summaryLines = wrapText(personality.summary, 22).slice(0, 5);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-card="atlas">
  <metadata>qingqing-atlas-card:${escapeXml(personality.id)}</metadata>
  <defs>
    <linearGradient id="atlas-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#edf7ed"/>
      <stop offset="52%" stop-color="#fffdf5"/>
      <stop offset="100%" stop-color="#f7f1dc"/>
    </linearGradient>
    <style>
      .eyebrow { font: 850 26px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #376f47; }
      .title { font: 900 72px "Noto Serif SC", "Songti SC", serif; fill: #20332c; }
      .motif { font: 900 30px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #9a6238; }
      .body { font: 500 32px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #365348; }
      .keyword { font: 900 28px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #1f4731; }
      .small { font: 750 22px "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #607269; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#atlas-bg)"/>
  <path d="M0 940 C180 885 320 955 455 905 C620 845 740 912 900 862 L900 1200 L0 1200 Z" fill="#cfe5bb"/>
  <path d="M0 1015 C170 970 350 1025 520 988 C700 948 790 1004 900 970 L900 1200 L0 1200 Z" fill="#93bd75" opacity="0.78"/>
  <rect x="58" y="58" width="784" height="970" rx="36" fill="#fffdf5" opacity="0.92" stroke="#c9d8c2" stroke-width="3"/>
  <text x="108" y="136" class="eyebrow">青青草原人格图鉴</text>
  <text x="108" y="210" class="small">${isCurrent ? "当前结果" : "图鉴卡"} / ${escapeXml(personality.id)}</text>
  <text x="108" y="335" class="title">${escapeXml(personality.name)}</text>
  <text x="108" y="394" class="motif">${escapeXml(visualProfile.motifLabel)}</text>
  <text x="108" y="452" class="small">${escapeXml(visualProfile.terrainLine)}</text>
  <rect x="108" y="505" width="684" height="78" rx="39" fill="#edf7ed" stroke="#c9d8c2"/>
  <text x="144" y="555" class="keyword">${keywordText}</text>
  ${summaryLines.map((line, index) => `<text x="108" y="${660 + index * 46}" class="body">${escapeXml(line)}</text>`).join("")}
  <line x1="108" y1="925" x2="792" y2="925" stroke="#d4dfc8" stroke-width="3"/>
  <text x="108" y="980" class="small">娱乐自测，不是心理诊断。</text>
  <text x="108" y="1030" class="small">qingqing-grassland-personality.vercel.app</text>
</svg>`;
}

function getShareCardStyle(styleId: ShareCardStyleId): ShareCardStyle {
  return shareCardStyles.find((style) => style.id === styleId) ?? shareCardStyles[0]!;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(value: string, maxLength: number): string[] {
  const result: string[] = [];

  for (let index = 0; index < value.length; index += maxLength) {
    result.push(value.slice(index, index + maxLength));
  }

  return result.length > 0 ? result : [""];
}
