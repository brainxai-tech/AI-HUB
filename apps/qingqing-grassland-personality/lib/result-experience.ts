import {
  personalityTypes,
  type AnswerValue,
  type PersonalityType,
  type TestModeId
} from "../data/personality-test.ts";
import { getAnchorDistance } from "./scoring.ts";
import { getPersonalityVisualProfile } from "./result-presentation.ts";
import { getRelationshipReport, type RelationshipReport } from "./social-growth.ts";

export type ResultTabId = "overview" | "social" | "atlas" | "scores" | "archive" | "share";

export type ResultTab = {
  id: ResultTabId;
  label: string;
  eyebrow: string;
};

export type AnswerFeedbackTone = "disagree" | "neutral" | "agree";

export type AnswerFeedback = {
  tone: AnswerFeedbackTone;
  label: string;
  message: string;
};

export type ExperienceModeNudge = {
  title: string;
  body: string;
  ctaLabel: string;
};

export type PersonalityUniversePoint = {
  id: string;
  name: string;
  motifLabel: string;
  toneClass: string;
  x: number;
  y: number;
  quadrant: string;
  isCurrent: boolean;
};

export type RelationshipCombo = {
  id: string;
  label: string;
  description: string;
  partner: PersonalityType;
  report: RelationshipReport;
};

export const resultTabs: ResultTab[] = [
  { id: "overview", label: "结果", eyebrow: "核心画像" },
  { id: "social", label: "相处", eyebrow: "关系天气" },
  { id: "atlas", label: "图鉴", eyebrow: "草原宇宙" },
  { id: "scores", label: "分数", eyebrow: "五维风向" },
  { id: "archive", label: "档案", eyebrow: "本机记录" },
  { id: "share", label: "分享", eyebrow: "结果卡片" }
];

const feedbackByAnswer: Record<AnswerValue, AnswerFeedback> = {
  1: {
    tone: "disagree",
    label: "很不像你",
    message: "这片草叶先轻轻压低了，系统会把它记成反向倾向。"
  },
  2: {
    tone: "disagree",
    label: "不太像你",
    message: "收到，一个偏弱信号，比完全否定更留有余地。"
  },
  3: {
    tone: "neutral",
    label: "暂时中立",
    message: "这题先停在草原中央，不会把风向推得太偏。"
  },
  4: {
    tone: "agree",
    label: "比较像你",
    message: "这阵风已经有方向了，会温和推高对应维度。"
  },
  5: {
    tone: "agree",
    label: "非常像你",
    message: "强信号已记录，这一侧的草原会更亮一点。"
  }
};

export function getAnswerFeedback(value: AnswerValue): AnswerFeedback {
  return feedbackByAnswer[value];
}

export function getExperienceModeNudge(
  modeId: TestModeId,
  answeredCount: number
): ExperienceModeNudge | null {
  if (modeId !== "experience") {
    return null;
  }

  return {
    title: "这是 15 题快照，适合先尝鲜",
    body: `体验版已经根据 ${answeredCount} 道题给出草原意象；如果想让五维风向更稳定，可以再走一遍 30 题专业版。`,
    ctaLabel: "切换到专业版重测"
  };
}

export function getPersonalityUniversePoints(currentTypeId: string): PersonalityUniversePoint[] {
  return personalityTypes.map((type) => {
    const visualProfile = getPersonalityVisualProfile(type.id);

    return {
      id: type.id,
      name: type.name,
      motifLabel: visualProfile.motifLabel,
      toneClass: visualProfile.toneClass,
      x: scoreToMapPercent(type.anchor.SE),
      y: 100 - scoreToMapPercent(type.anchor.AC),
      quadrant: getUniverseQuadrant(type.anchor.SE, type.anchor.AC),
      isCurrent: type.id === currentTypeId
    };
  });
}

export function getRelationshipComboLibrary(self: PersonalityType): RelationshipCombo[] {
  const candidates = personalityTypes
    .filter((type) => type.id !== self.id)
    .map((type) => ({
      type,
      distance: getAnchorDistance(self.anchor, type.anchor),
      rbDiff: Math.abs(self.anchor.RB - type.anchor.RB),
      rvDiff: Math.abs(self.anchor.RV - type.anchor.RV)
    }))
    .sort((a, b) => a.distance - b.distance || a.type.id.localeCompare(b.type.id));

  const selected = [
    createComboPick(self, "same-wind", "顺风搭子", "五维距离最近，适合先从低摩擦的小合作开始。", candidates[0]),
    createComboPick(
      self,
      "complement",
      "互补景观",
      "差异不算太远，容易把彼此没带的那一面补出来。",
      [...candidates].sort((a, b) => Math.abs(a.distance - 260) - Math.abs(b.distance - 260))[0]
    ),
    createComboPick(self, "challenge", "新鲜挑战", "距离最远，适合带着好奇心慢慢校准节奏。", candidates[candidates.length - 1]),
    createComboPick(
      self,
      "boundary",
      "边界练习",
      "关系策略差异明显，适合练习把在意和边界一起说清楚。",
      [...candidates].sort((a, b) => b.rbDiff - a.rbDiff || a.rvDiff - b.rvDiff)[0]
    )
  ];

  const uniqueCombos: RelationshipCombo[] = [];
  const usedPartnerIds = new Set<string>();

  for (const combo of selected) {
    if (!combo || usedPartnerIds.has(combo.partner.id)) {
      continue;
    }

    uniqueCombos.push(combo);
    usedPartnerIds.add(combo.partner.id);
  }

  for (const candidate of candidates) {
    if (uniqueCombos.length >= 4) {
      break;
    }

    if (usedPartnerIds.has(candidate.type.id)) {
      continue;
    }

    uniqueCombos.push(
      createRelationshipCombo({
        self,
        id: `extra-${candidate.type.id}`,
        label: "备用风向",
        description: "也可以作为一组轻量观察对象，看见另一种相处节奏。",
        partner: candidate.type
      })
    );
    usedPartnerIds.add(candidate.type.id);
  }

  return uniqueCombos;
}

function createComboPick(
  self: PersonalityType,
  id: string,
  label: string,
  description: string,
  candidate?: { type: PersonalityType }
): RelationshipCombo | null {
  if (!candidate) {
    return null;
  }

  return createRelationshipCombo({
    self,
    id,
    label,
    description,
    partner: candidate.type
  });
}

function createRelationshipCombo({
  self,
  id,
  label,
  description,
  partner
}: {
  self: PersonalityType;
  id: string;
  label: string;
  description: string;
  partner: PersonalityType;
}): RelationshipCombo {
  return {
    id,
    label,
    description,
    partner,
    report: getRelationshipReport(self, partner)
  };
}

function scoreToMapPercent(value: number): number {
  return Math.round(6 + ((Math.max(-100, Math.min(100, value)) + 100) / 200) * 88);
}

function getUniverseQuadrant(socialEnergy: number, actionStyle: number): string {
  if (socialEnergy >= 0 && actionStyle >= 0) {
    return "群体发光 × 灵感冲刺";
  }

  if (socialEnergy >= 0 && actionStyle < 0) {
    return "群体发光 × 稳扎稳打";
  }

  if (socialEnergy < 0 && actionStyle >= 0) {
    return "独处蓄电 × 灵感冲刺";
  }

  return "独处蓄电 × 稳扎稳打";
}
