import type { DreamSymbol } from "../shared/types";

interface SymbolRule {
  keywords: string[];
  name: string;
  meaning: string;
}

const symbolRules: SymbolRule[] = [
  {
    keywords: ["蛇", "蟒", "青蛇", "毒蛇"],
    name: "蛇",
    meaning: "常被视为变化、隐秘压力、直觉或关系边界的象征。"
  },
  {
    keywords: ["牙", "掉牙", "牙齿"],
    name: "牙齿",
    meaning: "常关联表达、形象、成长焦虑，传统解读中也提示留意家人与健康。"
  },
  {
    keywords: ["水", "河", "海", "雨", "洪水"],
    name: "水",
    meaning: "多与情绪流动、财气想象、潜意识和环境变化有关。"
  },
  {
    keywords: ["飞", "飞翔", "天空"],
    name: "飞翔",
    meaning: "象征摆脱限制、向上突破，也可能反映对自由和掌控感的需要。"
  },
  {
    keywords: ["考试", "迟到", "学校", "老师"],
    name: "考试",
    meaning: "多指向评价压力、准备感不足，或对某个现实节点的担心。"
  },
  {
    keywords: ["追", "逃", "躲", "怪物"],
    name: "追逐",
    meaning: "通常反映回避的任务、关系压力或尚未处理的情绪。"
  },
  {
    keywords: ["钱", "金", "红包", "财富"],
    name: "钱财",
    meaning: "既可能是安全感与资源感，也可能是价值交换和自我肯定的投射。"
  },
  {
    keywords: ["火", "烧", "烟"],
    name: "火",
    meaning: "代表能量、冲突、欲望或快速变化，传统上也提示谨慎处理急事。"
  },
  {
    keywords: ["孩子", "婴儿", "怀孕"],
    name: "新生",
    meaning: "多象征新计划、新身份或脆弱但有潜力的部分。"
  },
  {
    keywords: ["死", "葬礼", "坟"],
    name: "结束",
    meaning: "通常不宜直译为凶兆，更常象征阶段结束、旧模式松动或失去感。"
  },
  {
    keywords: ["房子", "家", "门", "屋"],
    name: "房屋",
    meaning: "常对应自我边界、家庭关系、安全感和生活结构。"
  },
  {
    keywords: ["猫", "狗", "鸟", "动物"],
    name: "动物",
    meaning: "常代表本能、陪伴、警觉或某种未被充分表达的情绪。"
  }
];

export function matchDreamSymbols(dreamText: string): DreamSymbol[] {
  const matched = symbolRules
    .filter((rule) => rule.keywords.some((keyword) => dreamText.includes(keyword)))
    .slice(0, 5)
    .map(({ name, meaning }) => ({ name, meaning }));

  if (matched.length > 0) {
    return matched;
  }

  return [
    {
      name: "梦境整体氛围",
      meaning: "当前梦境没有命中常见意象库，建议更多关注情绪、人物关系和醒来后的身体感受。"
    }
  ];
}
