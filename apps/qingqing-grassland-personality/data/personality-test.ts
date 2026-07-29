export type DimensionId = "SE" | "AC" | "RB" | "RV" | "EE";
export type AnswerValue = 1 | 2 | 3 | 4 | 5;

export type DimensionVector = Record<DimensionId, number>;
export type TestModeId = "professional" | "experience";

export type Dimension = {
  id: DimensionId;
  name: string;
  negativeLabel: string;
  positiveLabel: string;
  shortDescription: string;
};

export type QuestionMapping = {
  dimension: DimensionId;
  direction: 1 | -1;
};

export type Question = {
  id: number;
  text: string;
  mappings: QuestionMapping[];
};

export type PersonalityType = {
  id: string;
  name: string;
  anchor: DimensionVector;
  keywords: string[];
  summary: string;
  strength: string;
  blindSpot: string;
  relationshipTip: string;
  dailyAdvice: string;
};

export type TestMode = {
  id: TestModeId;
  name: string;
  badge: string;
  questionIds: number[];
  estimatedTime: string;
  description: string;
};

export const dimensions: Dimension[] = [
  {
    id: "SE",
    name: "社交能量",
    negativeLabel: "独处蓄电",
    positiveLabel: "群体发光",
    shortDescription: "你更从安静独处还是群体互动里获得能量。"
  },
  {
    id: "AC",
    name: "行动方式",
    negativeLabel: "稳扎稳打",
    positiveLabel: "灵感冲刺",
    shortDescription: "你更偏计划推进，还是先做起来再迭代。"
  },
  {
    id: "RB",
    name: "关系策略",
    negativeLabel: "照顾融合",
    positiveLabel: "边界清醒",
    shortDescription: "你在关系里更自然地照顾连接，还是守住边界。"
  },
  {
    id: "RV",
    name: "风险偏好",
    negativeLabel: "谨慎避坑",
    positiveLabel: "先冲再说",
    shortDescription: "你面对未知时更倾向预案，还是抓住机会。"
  },
  {
    id: "EE",
    name: "情绪表达",
    negativeLabel: "自我消化",
    positiveLabel: "外放表达",
    shortDescription: "你更习惯先内部处理情绪，还是说出来更清楚。"
  }
];

export const answerOptions: { value: AnswerValue; label: string }[] = [
  { value: 1, label: "非常不同意" },
  { value: 2, label: "不同意" },
  { value: 3, label: "一般" },
  { value: 4, label: "同意" },
  { value: 5, label: "非常同意" }
];

export const questions: Question[] = [
  {
    id: 1,
    text: "聚会结束后，如果气氛还不错，我通常还能继续接下一场。",
    mappings: [
      { dimension: "SE", direction: 1 },
      { dimension: "EE", direction: 1 }
    ]
  },
  {
    id: 2,
    text: "我更喜欢先一个人把想法想清楚，再拿出来说。",
    mappings: [
      { dimension: "SE", direction: -1 },
      { dimension: "EE", direction: -1 }
    ]
  },
  {
    id: 3,
    text: "新任务开始前，我会先列步骤、查资料、确认风险。",
    mappings: [
      { dimension: "AC", direction: -1 },
      { dimension: "RV", direction: -1 }
    ]
  },
  {
    id: 4,
    text: "有灵感的时候，我更愿意先做起来，再边做边修。",
    mappings: [
      { dimension: "AC", direction: 1 },
      { dimension: "RV", direction: 1 }
    ]
  },
  {
    id: 5,
    text: "看到别人情绪低落，我会本能地想照顾对方。",
    mappings: [
      { dimension: "RB", direction: -1 },
      { dimension: "EE", direction: -1 }
    ]
  },
  {
    id: 6,
    text: "关系再亲密，我也希望彼此保留清楚的边界。",
    mappings: [
      { dimension: "RB", direction: 1 },
      { dimension: "SE", direction: -1 }
    ]
  },
  {
    id: 7,
    text: "发生冲突时，我第一反应是先让场面冷下来。",
    mappings: [
      { dimension: "RB", direction: -1 },
      { dimension: "EE", direction: -1 }
    ]
  },
  {
    id: 8,
    text: "重要的话我宁愿直接说清楚，不想绕太久。",
    mappings: [
      { dimension: "RB", direction: 1 },
      { dimension: "EE", direction: 1 }
    ]
  },
  {
    id: 9,
    text: "一个机会只要足够有趣，即使不确定，我也愿意试。",
    mappings: [
      { dimension: "RV", direction: 1 },
      { dimension: "AC", direction: 1 }
    ]
  },
  {
    id: 10,
    text: "我不太喜欢把自己放进不可控的局面里。",
    mappings: [
      { dimension: "RV", direction: -1 },
      { dimension: "AC", direction: -1 }
    ]
  },
  {
    id: 11,
    text: "我常常是朋友里负责把气氛点起来的人。",
    mappings: [
      { dimension: "SE", direction: 1 },
      { dimension: "EE", direction: 1 }
    ]
  },
  {
    id: 12,
    text: "在群体里，我经常默默观察大家的情绪和关系变化。",
    mappings: [
      { dimension: "SE", direction: -1 },
      { dimension: "EE", direction: -1 }
    ]
  },
  {
    id: 13,
    text: "固定节奏、清楚安排和可预期结果会让我安心。",
    mappings: [
      { dimension: "AC", direction: -1 },
      { dimension: "RV", direction: -1 }
    ]
  },
  {
    id: 14,
    text: "临场发挥带来的刺激感，反而会让我更兴奋。",
    mappings: [
      { dimension: "AC", direction: 1 },
      { dimension: "RV", direction: 1 }
    ]
  },
  {
    id: 15,
    text: "做决定时，我会先想这件事会不会影响身边的人。",
    mappings: [
      { dimension: "RB", direction: -1 },
      { dimension: "RV", direction: -1 }
    ]
  },
  {
    id: 16,
    text: "当别人越界时，我能比较坚定地拒绝。",
    mappings: [
      { dimension: "RB", direction: 1 },
      { dimension: "EE", direction: 1 }
    ]
  },
  {
    id: 17,
    text: "情绪上来时，我通常会先自己消化，不急着表达。",
    mappings: [
      { dimension: "EE", direction: -1 },
      { dimension: "SE", direction: -1 }
    ]
  },
  {
    id: 18,
    text: "我开心、生气或委屈时，通常很难完全藏住。",
    mappings: [
      { dimension: "EE", direction: 1 },
      { dimension: "SE", direction: 1 }
    ]
  },
  {
    id: 19,
    text: "我愿意为了重要目标长期潜伏，慢慢积累。",
    mappings: [
      { dimension: "AC", direction: -1 },
      { dimension: "SE", direction: -1 }
    ]
  },
  {
    id: 20,
    text: "我受不了一件事拖太久，宁可快速推进。",
    mappings: [
      { dimension: "AC", direction: 1 },
      { dimension: "EE", direction: 1 }
    ]
  },
  {
    id: 21,
    text: "到新环境里，我会主动找人连接、打开局面。",
    mappings: [
      { dimension: "SE", direction: 1 },
      { dimension: "RB", direction: -1 }
    ]
  },
  {
    id: 22,
    text: "到新环境里，我会先观察规则、人际结构和安全感。",
    mappings: [
      { dimension: "SE", direction: -1 },
      { dimension: "AC", direction: -1 }
    ]
  },
  {
    id: 23,
    text: "面对风险，我会习惯性准备多个备用方案。",
    mappings: [
      { dimension: "RV", direction: -1 },
      { dimension: "AC", direction: -1 }
    ]
  },
  {
    id: 24,
    text: "做选择时，我更怕错过机会，而不是害怕失败。",
    mappings: [
      { dimension: "RV", direction: 1 },
      { dimension: "AC", direction: 1 }
    ]
  },
  {
    id: 25,
    text: "我很容易承担“照顾大家情绪”的责任。",
    mappings: [
      { dimension: "RB", direction: -1 },
      { dimension: "SE", direction: 1 }
    ]
  },
  {
    id: 26,
    text: "比起被频繁关心，我更希望自己的空间被尊重。",
    mappings: [
      { dimension: "RB", direction: 1 },
      { dimension: "SE", direction: -1 }
    ]
  },
  {
    id: 27,
    text: "遇到问题时，我通常先稳定局面，再处理情绪。",
    mappings: [
      { dimension: "RV", direction: -1 },
      { dimension: "EE", direction: -1 }
    ]
  },
  {
    id: 28,
    text: "压力越大，我越需要说出来，聊完才会清楚。",
    mappings: [
      { dimension: "EE", direction: 1 },
      { dimension: "SE", direction: 1 }
    ]
  },
  {
    id: 29,
    text: "我会为了一个漂亮、有趣或突然冒出来的想法临时改计划。",
    mappings: [
      { dimension: "AC", direction: 1 },
      { dimension: "EE", direction: 1 }
    ]
  },
  {
    id: 30,
    text: "我相信真正可靠的关系，不需要天天证明。",
    mappings: [
      { dimension: "RB", direction: 1 },
      { dimension: "EE", direction: -1 }
    ]
  }
];

export const testModes: TestMode[] = [
  {
    id: "professional",
    name: "专业版",
    badge: "完整 30 题",
    questionIds: questions.map((question) => question.id),
    estimatedTime: "4-6 分钟",
    description: "保留当前完整体验，五个维度覆盖更细，结果更稳定。"
  },
  {
    id: "experience",
    name: "体验版",
    badge: "快速 15 题",
    questionIds: [1, 3, 5, 6, 8, 9, 13, 15, 17, 19, 21, 24, 25, 27, 29],
    estimatedTime: "2-3 分钟",
    description: "适合先尝鲜，题量减半，但五个维度映射保持均衡。"
  }
];

export function getQuestionsForMode(modeId: TestModeId): Question[] {
  const mode = testModes.find((item) => item.id === modeId) ?? testModes[0];

  return mode.questionIds.map((questionId) => {
    const question = questions.find((item) => item.id === questionId);

    if (!question) {
      throw new Error(`Question ${questionId} is missing from the shared question bank.`);
    }

    return question;
  });
}

export const personalityTypes: PersonalityType[] = [
  {
    id: "morning-dew-grass",
    name: "晨露小草型",
    anchor: { SE: -40, AC: -40, RB: -60, RV: -40, EE: -80 },
    keywords: ["温和", "敏感", "慢热", "共情"],
    summary: "你像清晨草叶上的露水，安静、细腻，能捕捉到别人忽略的情绪变化。",
    strength: "共情力强，容易发现他人的真实感受，是很温柔的倾听者。",
    blindSpot: "容易内耗，怕麻烦别人，也容易把别人的情绪背到自己身上。",
    relationshipTip: "和你相处时，真诚、慢节奏、稳定回应最重要。",
    dailyAdvice: "先照顾自己的感受，再去温柔别人。"
  },
  {
    id: "grassland-sun",
    name: "草原太阳型",
    anchor: { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
    keywords: ["热情", "外向", "感染力", "明亮"],
    summary: "你像草原上的太阳，自带热度和存在感，很容易把周围气氛点亮。",
    strength: "能带动气氛，适合做团队发动机，也很擅长鼓励别人。",
    blindSpot: "容易过度承诺，答应太多后把自己烧得太累。",
    relationshipTip: "你需要被回应、被看见，也需要有人提醒你保留能量。",
    dailyAdvice: "热情很好，但别忘了给自己留一点光。"
  },
  {
    id: "wind-vane",
    name: "风向旗型",
    anchor: { SE: 40, AC: 40, RB: 0, RV: 0, EE: 40 },
    keywords: ["机灵", "观察", "应变", "灵活"],
    summary: "你像草原上的风向旗，能快速感知局势变化，并找到最合适的反应方式。",
    strength: "反应快，会看局势，懂得随机应变。",
    blindSpot: "有时立场容易摇摆，别人可能看不清你真正想要什么。",
    relationshipTip: "你适合和尊重变化、沟通灵活的人相处。",
    dailyAdvice: "顺风而动时，也记得确认自己的方向。"
  },
  {
    id: "haystack-fortress",
    name: "草垛堡垒型",
    anchor: { SE: -40, AC: -80, RB: 40, RV: -80, EE: -40 },
    keywords: ["安稳", "可靠", "防御感", "踏实"],
    summary: "你像一座厚实的草垛堡垒，稳、暖、抗风，给人很强的安全感。",
    strength: "稳定可靠，抗压能力强，适合守住重要的事情。",
    blindSpot: "不太愿意冒险，容易因为害怕变化而错过机会。",
    relationshipTip: "你需要可预期、讲信用、有安全感的关系。",
    dailyAdvice: "稳住很好，但偶尔也可以把门打开一点。"
  },
  {
    id: "distant-mountain-solo",
    name: "远山独行型",
    anchor: { SE: -80, AC: -40, RB: 80, RV: -40, EE: -80 },
    keywords: ["独立", "清醒", "距离感", "判断力"],
    summary: "你像草原尽头的远山，安静、独立，有自己的判断和边界。",
    strength: "判断力强，不容易被群体情绪裹挟。",
    blindSpot: "容易显得冷淡，让别人误以为你不在乎。",
    relationshipTip: "你适合低消耗、高尊重、不过度打扰的关系。",
    dailyAdvice: "保持边界时，也可以让重要的人知道你在意。"
  },
  {
    id: "campfire-center",
    name: "篝火中心型",
    anchor: { SE: 80, AC: -40, RB: -80, RV: -40, EE: 40 },
    keywords: ["聚合", "照顾", "人情味", "陪伴"],
    summary: "你像草原夜晚的篝火，总能把人聚到一起，也愿意照亮别人。",
    strength: "很会维系关系，是朋友之间的黏合剂。",
    blindSpot: "容易替别人操心太多，忽略自己的边界和疲惫。",
    relationshipTip: "你需要被感谢，也需要被允许休息。",
    dailyAdvice: "你可以温暖别人，但不必燃尽自己。"
  },
  {
    id: "thunderstorm-charge",
    name: "雷雨冲锋型",
    anchor: { SE: 40, AC: 80, RB: 40, RV: 80, EE: 80 },
    keywords: ["直接", "爆发力", "行动派", "敢扛"],
    summary: "你像草原上的雷雨，来得快、力量足，遇事不爱拖泥带水。",
    strength: "决策快，行动强，关键时刻敢扛事。",
    blindSpot: "容易冲动，说话太硬，可能吓到节奏慢的人。",
    relationshipTip: "你适合和能直说、能承压、也能提醒你降速的人相处。",
    dailyAdvice: "冲锋之前，先确认方向。"
  },
  {
    id: "cloud-dreamer",
    name: "云朵幻想型",
    anchor: { SE: 0, AC: 80, RB: 0, RV: 40, EE: 40 },
    keywords: ["想象力", "浪漫", "跳脱", "创意"],
    summary: "你像草原上不断变形的云朵，脑子里总有新鲜、有趣、漂亮的画面。",
    strength: "创意强，能把普通事情变得有意思。",
    blindSpot: "执行容易飘，可能想得很美但收尾困难。",
    relationshipTip: "你需要既欣赏你的想象力、又能帮你落地的人。",
    dailyAdvice: "今天让一个想法真正落到地上。"
  },
  {
    id: "herd-bell-order",
    name: "牧铃秩序型",
    anchor: { SE: 0, AC: -80, RB: 40, RV: -80, EE: -40 },
    keywords: ["规则感", "认真", "负责", "秩序"],
    summary: "你像草原上的牧铃，用清楚的节奏让混乱变得可控。",
    strength: "计划清晰，责任感强，适合管理复杂事务。",
    blindSpot: "容易焦虑失控变量，对临时变化不太舒服。",
    relationshipTip: "你需要明确承诺、清晰计划和靠谱反馈。",
    dailyAdvice: "计划可以保护你，但不必困住你。"
  },
  {
    id: "stream-repair",
    name: "小溪修复型",
    anchor: { SE: 20, AC: -40, RB: -80, RV: -40, EE: -40 },
    keywords: ["温柔", "疗愈", "缓冲", "倾听"],
    summary: "你像草原边的小溪，安静流动，擅长把紧绷的东西慢慢松开。",
    strength: "很会安抚冲突，适合做倾听者和关系修复者。",
    blindSpot: "容易回避正面冲突，把自己的不舒服往后放。",
    relationshipTip: "你需要被认真倾听，而不是只负责安慰别人。",
    dailyAdvice: "温柔不是退让，修复也包括说出真实感受。"
  },
  {
    id: "grass-seed-latent",
    name: "草籽潜伏型",
    anchor: { SE: -80, AC: -80, RB: 0, RV: -40, EE: -80 },
    keywords: ["低调", "耐心", "后劲", "积累"],
    summary: "你像埋在土里的草籽，表面安静，内里一直在准备生长。",
    strength: "不声张但很能坚持，适合长期积累型目标。",
    blindSpot: "容易被低估，也容易自我怀疑。",
    relationshipTip: "你需要有人看见你的过程，而不是只催你开花。",
    dailyAdvice: "慢慢长，也是在长。"
  },
  {
    id: "starry-night-watch",
    name: "星星守夜型",
    anchor: { SE: -40, AC: -80, RB: -40, RV: -80, EE: -40 },
    keywords: ["细腻", "警觉", "守护", "预判"],
    summary: "你像草原夜空里的星星，安静守着重要的人和事。",
    strength: "能提前发现风险，很会保护在意的人。",
    blindSpot: "容易过度担心，把小信号放大成大问题。",
    relationshipTip: "你需要稳定的确认感和不会嫌你敏感的人。",
    dailyAdvice: "有些夜晚不需要你一直守着。"
  },
  {
    id: "wildflower-expression",
    name: "野花表达型",
    anchor: { SE: 40, AC: 80, RB: 40, RV: 40, EE: 80 },
    keywords: ["自由", "审美", "鲜活", "表达"],
    summary: "你像草原上的野花，自由、鲜明，有自己的颜色和姿态。",
    strength: "个人风格强，表达有魅力，容易留下记忆点。",
    blindSpot: "容易三分钟热度，情绪和兴趣变化快。",
    relationshipTip: "你适合和尊重自由、不急着定义你的人相处。",
    dailyAdvice: "尽情开放，也给自己一点持续的根。"
  },
  {
    id: "long-slope-observer",
    name: "长坡观察型",
    anchor: { SE: -40, AC: -80, RB: 40, RV: -40, EE: -40 },
    keywords: ["深思考", "慢决策", "理性", "长远"],
    summary: "你像草原上的长坡，不急着抵达，但看得远、想得深。",
    strength: "看问题长远，不容易被短期情绪带节奏。",
    blindSpot: "行动启动慢，容易错过需要快速响应的窗口。",
    relationshipTip: "你需要别人给你思考空间，也需要适度的行动提醒。",
    dailyAdvice: "想清楚之后，迈出一步就很好。"
  },
  {
    id: "warm-breeze-social",
    name: "暖风社交型",
    anchor: { SE: 80, AC: 0, RB: -80, RV: 0, EE: 40 },
    keywords: ["亲切", "圆融", "破冰", "人缘"],
    summary: "你像草原上的暖风，靠近你的人通常会觉得轻松、自然。",
    strength: "人缘好，擅长破冰、接话和协作。",
    blindSpot: "容易讨好别人，拒绝时会有负担。",
    relationshipTip: "你需要练习把舒服留给别人，也留给自己。",
    dailyAdvice: "不是所有人的期待都需要你接住。"
  },
  {
    id: "stone-anchor",
    name: "石头定海型",
    anchor: { SE: 0, AC: -80, RB: 80, RV: -80, EE: -80 },
    keywords: ["沉稳", "原则", "可靠", "不慌"],
    summary: "你像草原上的石头，安静但有分量，关键时刻能稳住局面。",
    strength: "原则强，关键时刻可靠，不容易慌乱。",
    blindSpot: "不擅长表达柔软面，容易让人误会你没有情绪。",
    relationshipTip: "你适合和尊重原则、也愿意慢慢靠近你的人相处。",
    dailyAdvice: "可靠之外，也可以偶尔柔软。"
  },
  {
    id: "rainbow-mediator",
    name: "彩虹调停型",
    anchor: { SE: 40, AC: -40, RB: -80, RV: 0, EE: 40 },
    keywords: ["乐观", "协调", "平衡", "缓和"],
    summary: "你像雨后的彩虹，擅长让紧张的人和事重新找到缓和的可能。",
    strength: "擅长化解尴尬和对立，能让关系回到可沟通状态。",
    blindSpot: "容易牺牲自己的真实想法，只为了维持和平。",
    relationshipTip: "你需要能问你真实想法、而不是只依赖你调停的人。",
    dailyAdvice: "平衡别人之前，也问问自己站在哪里。"
  },
  {
    id: "grassland-scout",
    name: "草原侦察型",
    anchor: { SE: -40, AC: 40, RB: 0, RV: 40, EE: -40 },
    keywords: ["好奇", "敏锐", "信息控", "洞察"],
    summary: "你像草原上的侦察者，安静地收集线索，寻找机会和异常。",
    strength: "善于观察、分析和发现别人没看到的信息。",
    blindSpot: "容易想太多，脑内推演停不下来。",
    relationshipTip: "你适合和愿意分享信息、尊重你独立判断的人相处。",
    dailyAdvice: "看见线索之后，也允许自己做一个简单决定。"
  },
  {
    id: "swift-wind-adventurer",
    name: "疾风冒险型",
    anchor: { SE: 40, AC: 80, RB: 80, RV: 80, EE: 0 },
    keywords: ["尝试", "变化", "突破", "不怕输"],
    summary: "你像草原上的疾风，喜欢变化，敢于进入未知，也不太怕失败。",
    strength: "适合开局、探索和突破，能带来新机会。",
    blindSpot: "容易忽略收尾和长期维护。",
    relationshipTip: "你需要既给你自由、又能帮你复盘的人。",
    dailyAdvice: "去冒险，也记得带回成果。"
  },
  {
    id: "moonlight-boundary",
    name: "月光边界型",
    anchor: { SE: -80, AC: 0, RB: 80, RV: 0, EE: -40 },
    keywords: ["安静", "清醒", "分寸", "高质量关系"],
    summary: "你像草原上的月光，安静、有距离感，但并不冷漠。",
    strength: "很懂自我保护，关系质量高，不轻易消耗自己。",
    blindSpot: "容易让人觉得难靠近，甚至误以为你不需要陪伴。",
    relationshipTip: "你适合边界清楚、低压、真诚稳定的关系。",
    dailyAdvice: "保护自己很好，也可以让值得的人靠近一点。"
  }
];
