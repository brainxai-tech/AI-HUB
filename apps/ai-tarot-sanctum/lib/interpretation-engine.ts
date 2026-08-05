import type {
  ActionAdvice,
  CardInterpretation,
  DrawnCard,
  GeneratedReading,
  QuestionIntent,
  QuestionIntentId,
  ReadingInterpretation,
  ReadingTheme,
  ReadingVerdict,
  SpreadPosition,
  VerdictSignal,
  VerdictScoreFactor,
} from "./types.ts";

const positionLabels: Record<SpreadPosition, string> = {
  root: "根源",
  present: "现状",
  trend: "趋势",
};

const positionPrompts: Record<SpreadPosition, string> = {
  root: "藏在表层之下",
  present: "正在当下发挥作用",
  trend: "若当前模式持续，接下来更容易增长",
};

const suitLabels: Record<string, string> = {
  wands: "权杖",
  cups: "圣杯",
  swords: "宝剑",
  pentacles: "星币",
};

const cardVerdictBias: Record<string, number> = {
  "the-fool": 0.7,
  "the-magician": 1.2,
  "the-high-priestess": 0.1,
  "the-empress": 1.1,
  "the-emperor": 0.6,
  "the-hierophant": 0.4,
  "the-lovers": 1.1,
  "the-chariot": 1.2,
  strength: 0.9,
  "the-hermit": -0.2,
  "wheel-of-fortune": 0.3,
  justice: 0.1,
  "the-hanged-man": -0.9,
  death: -0.8,
  temperance: 0.5,
  "the-devil": -1.5,
  "the-tower": -1.8,
  "the-star": 1.3,
  "the-moon": -1,
  "the-sun": 1.8,
  judgement: 0.7,
  "the-world": 1.6,
};

type IntentRule = {
  id: QuestionIntentId;
  label: string;
  judgmentPath: string;
  keywords: string[];
};

const intentRules: Record<ReadingTheme, IntentRule[]> = {
  relationship: [
    {
      id: "relationship-reunion",
      label: "复合 / 重新靠近",
      judgmentPath: "判断双方是否具备重新靠近的现实条件，而不是只看想念或情绪强度。",
      keywords: ["复合", "挽回", "回来", "和好", "重归于好", "重新开始"],
    },
    {
      id: "relationship-progress",
      label: "推进关系",
      judgmentPath: "判断当前关系是否适合更进一步，以及推进后会遇到什么代价。",
      keywords: ["在一起", "表白", "推进", "发展", "确定关系", "更进一步"],
    },
    {
      id: "relationship-boundary",
      label: "边界 / 放下",
      judgmentPath: "判断是否应该设下边界、拉开距离，或停止继续投入。",
      keywords: ["边界", "放下", "断联", "拒绝", "离开", "停止"],
    },
    {
      id: "relationship-communication",
      label: "沟通 / 联系",
      judgmentPath: "判断现在是否适合开口、联系，或把某件事说清楚。",
      keywords: ["联系", "沟通", "消息", "开口", "解释", "说清楚"],
    },
    {
      id: "relationship-timing",
      label: "时机 / 等待",
      judgmentPath: "判断此刻适不适合行动，以及等待是否真的会改善局面。",
      keywords: ["什么时候", "时机", "等待", "现在", "多久", "近期"],
    },
  ],
  career: [
    {
      id: "career-opportunity",
      label: "机会判断",
      judgmentPath: "判断这个机会是否值得推进，以及最小验证动作是什么。",
      keywords: ["机会", "offer", "项目", "合作", "跳槽", "创业"],
    },
    {
      id: "career-money",
      label: "金钱 / 投入",
      judgmentPath: "判断钱、资源或投入是否值得，以及需要先看见什么证据。",
      keywords: ["钱", "投资", "收入", "财富", "预算", "报价", "成本"],
    },
    {
      id: "career-execution",
      label: "执行 / 落地",
      judgmentPath: "判断下一步是否可以执行，以及真正的卡点在哪里。",
      keywords: ["执行", "落地", "推进", "计划", "开始", "上线"],
    },
    {
      id: "career-conflict",
      label: "冲突 / 风险",
      judgmentPath: "判断冲突是否会放大，以及该先保护哪条底线。",
      keywords: ["冲突", "风险", "压力", "争执", "老板", "同事"],
    },
    {
      id: "career-timing",
      label: "时机 / 节奏",
      judgmentPath: "判断现在是不是合适窗口，以及该快推还是慢验。",
      keywords: ["什么时候", "时机", "现在", "多久", "近期", "等待"],
    },
  ],
};

function themeName(theme: ReadingTheme): string {
  return theme === "relationship" ? "关系" : "事业与财富";
}

function detectQuestionIntent(question: string, theme: ReadingTheme): QuestionIntent {
  const normalized = question.toLocaleLowerCase("zh-CN");
  const matchedRule = intentRules[theme]
    .map((rule) => ({
      rule,
      matchedKeywords: rule.keywords.filter((keyword) => normalized.includes(keyword.toLocaleLowerCase("zh-CN"))),
    }))
    .find((match) => match.matchedKeywords.length > 0);

  if (matchedRule) {
    return {
      id: matchedRule.rule.id,
      label: matchedRule.rule.label,
      judgmentPath: matchedRule.rule.judgmentPath,
      matchedKeywords: matchedRule.matchedKeywords,
    };
  }

  return {
    id: "general-judgment",
    label: theme === "relationship" ? "关系方向判断" : "事业与财富方向判断",
    judgmentPath:
      theme === "relationship"
        ? "判断这段关系当前更适合推进、澄清、等待，还是设下边界。"
        : "判断这件事当前更适合推进、缩小测试、等待证据，还是降低投入。",
    matchedKeywords: [],
  };
}

function orientationLabel(card: DrawnCard): string {
  return card.orientation === "upright" ? "正位" : "逆位";
}

function themeMeaning(card: DrawnCard, theme: ReadingTheme): string {
  const base = theme === "relationship" ? card.card.relationshipMeaning : card.card.careerMeaning;
  const orientationText = card.orientation === "upright" ? card.card.upright : card.card.reversed;
  return `${orientationText} ${base}`;
}

function interpretCard(card: DrawnCard, theme: ReadingTheme): CardInterpretation {
  const orientationPhrase = card.orientation === "upright" ? "清晰表达" : "逆位信号";

  return {
    position: card.position,
    cardName: card.card.name,
    orientation: card.orientation,
    title: `${positionLabels[card.position]}: ${card.card.name}`,
    meaning: `作为${positionLabels[card.position]}牌，${card.card.name}${positionPrompts[card.position]}，呈现为一种${orientationPhrase}。${themeMeaning(card, theme)}`,
    risk: card.card.risk,
    advice: card.card.advice,
  };
}

function dominantSuit(reading: GeneratedReading): string | undefined {
  const suitCounts = reading.cards.reduce<Record<string, number>>((counts, card) => {
    const key = card.card.suit ?? "major";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function combinationLayer(reading: GeneratedReading): string {
  const reversedCount = reading.cards.filter((card) => card.orientation === "reversed").length;
  const majorCount = reading.cards.filter((card) => card.card.arcana === "major").length;
  const suit = dominantSuit(reading);
  const parts: string[] = [];

  if (reversedCount >= 2) {
    parts.push("逆位牌较多，说明在清爽推进之前，仍有阻滞、延迟或动机不清需要被看见。");
  } else if (reversedCount === 1) {
    parts.push("唯一的逆位牌标出主要结点：那里适合慢下来，重新检查假设。");
  } else {
    parts.push("三张牌全部正位，趋势较容易辨认，也更适合通过直接行动来验证。");
  }

  if (majorCount >= 2) {
    parts.push("大阿卡纳较多，这更像一个较大的课题、门槛或阶段性转折，而不是短暂情绪。");
  } else if (majorCount === 1) {
    parts.push("唯一的大阿卡纳给出核心主题，小阿卡纳则提示可操作的抓手。");
  } else {
    parts.push("全是小阿卡纳，重点会落在日常选择、习惯和可观察行为上。");
  }

  if (suit && suit !== "major") {
    parts.push(`重复出现的${suitLabels[suit] ?? suit}能量，说明这个问题正通过该牌组的领域展开。`);
  }

  return parts.join(" ");
}

function buildActions(reading: GeneratedReading): ActionAdvice {
  const reversedCount = reading.cards.filter((card) => card.orientation === "reversed").length;
  const trend = reading.cards.find((card) => card.position === "trend") ?? reading.cards[2];

  if (reading.theme === "relationship") {
    return {
      nextAction: reversedCount >= 2
        ? "提出一个平静、具体的澄清问题，并观察行为，而不只听安抚性语言。"
        : "说出你的感受和一个具体请求，但不要强迫对方给出某个结果。",
      avoid: "避免把强烈感、沉默或焦虑当成对方真实想法的证明。",
      sevenDayObservation: `未来七天观察${trend.card.name}是以重复行为、修复、距离，还是更清晰沟通的形式出现。`,
    };
  }

  return {
    nextAction: reversedCount >= 2
      ? "把决定缩小成一个低风险测试，并设定截止时间、负责人和可见成功信号。"
      : "选择资源路径最清晰的机会，并把下一步操作具体化。",
    avoid: "避免在证据支持之前扩大范围、增加支出或做出额外承诺。",
    sevenDayObservation: `未来七天追踪${trend.card.name}表现为动能、执行卡点、有效反馈，还是资源压力。`,
  };
}

function scoreCard(card: DrawnCard, theme: ReadingTheme): VerdictScoreFactor {
  const positionWeight: Record<SpreadPosition, number> = {
    root: 1,
    present: 1.25,
    trend: 1.6,
  };
  const orientationScore = card.orientation === "upright" ? 1 : -1;
  const arcanaBias = cardVerdictBias[card.card.id] ?? 0;
  const suitBias =
    theme === "relationship" && card.card.suit === "cups"
      ? 0.25
      : theme === "career" && card.card.suit === "pentacles"
        ? 0.25
        : 0;

  const contribution = Number(((orientationScore + arcanaBias + suitBias) * positionWeight[card.position]).toFixed(2));

  return {
    cardId: card.card.id,
    cardName: card.card.name,
    position: card.position,
    orientation: card.orientation,
    positionWeight: positionWeight[card.position],
    orientationScore,
    arcanaBias,
    suitBias,
    contribution,
  };
}

function confidenceFromScore(score: number): ReadingVerdict["confidence"] {
  const force = Math.abs(score);

  if (force >= 4) {
    return "high";
  }

  if (force >= 1.8) {
    return "medium";
  }

  return "low";
}

function buildSignal(factor: VerdictScoreFactor, card: DrawnCard): VerdictSignal {
  const direction = factor.contribution >= 0 ? "支持" : "阻力";
  const formattedScore = factor.contribution > 0 ? `+${factor.contribution}` : String(factor.contribution);

  return {
    cardName: factor.cardName,
    position: factor.position,
    orientation: factor.orientation,
    contribution: factor.contribution,
    text: `${positionLabels[factor.position]}位的${factor.cardName}（${orientationLabel(card)}）形成${direction}信号，贡献 ${formattedScore}。`,
  };
}

function buildSignals(reading: GeneratedReading, scoreBreakdown: VerdictScoreFactor[]) {
  const signals = scoreBreakdown.map((factor) => {
    const card = reading.cards.find((item) => item.card.id === factor.cardId && item.position === factor.position) ?? reading.cards[0];
    return buildSignal(factor, card);
  });

  return {
    supportSignals: signals
      .filter((signal) => signal.contribution >= 0)
      .sort((a, b) => b.contribution - a.contribution),
    resistanceSignals: signals
      .filter((signal) => signal.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution),
  };
}

function buildChangeCondition(
  reading: GeneratedReading,
  answer: ReadingVerdict["answer"],
  intent: QuestionIntent,
  resistanceSignals: VerdictSignal[],
): string {
  const trend = reading.cards.find((card) => card.position === "trend") ?? reading.cards[2];
  const strongestResistance = resistanceSignals[0];

  if (answer === "supportive") {
    return strongestResistance
      ? `改判条件：如果${strongestResistance.cardName}对应的阻力在现实里持续放大，且七天内看不到与${trend.card.name}一致的正向反馈，就需要重新判断“${intent.label}”。`
      : `改判条件：如果七天内完全没有出现与${trend.card.name}一致的现实反馈，或行动成本突然升高，就需要重新判断“${intent.label}”。`;
  }

  return `改判条件：只有当${trend.card.name}对应的趋势出现可观察改善，并且主要阻力被具体行动处理后，才适合重新判断“${intent.label}”。`;
}

function buildVerdict(reading: GeneratedReading, actions: ActionAdvice, intent: QuestionIntent): ReadingVerdict {
  const scoreBreakdown = reading.cards.map((card) => scoreCard(card, reading.theme));
  const score = Number(scoreBreakdown.reduce((total, factor) => total + factor.contribution, 0).toFixed(2));
  const answer: ReadingVerdict["answer"] = score >= 0 ? "supportive" : "blocked";
  const confidence = confidenceFromScore(score);
  const { supportSignals, resistanceSignals } = buildSignals(reading, scoreBreakdown);
  const changeCondition = buildChangeCondition(reading, answer, intent, resistanceSignals);
  const root = reading.cards.find((card) => card.position === "root") ?? reading.cards[0];
  const present = reading.cards.find((card) => card.position === "present") ?? reading.cards[1];
  const trend = reading.cards.find((card) => card.position === "trend") ?? reading.cards[2];
  const reversedCount = reading.cards.filter((card) => card.orientation === "reversed").length;
  const themeText = themeName(reading.theme);

  const confidenceText = confidence === "high" ? "强" : confidence === "medium" ? "中" : "弱";
  const why = answer === "supportive"
    ? `因为这组三牌里，助力大于阻力。根源位的${root.card.name}（${orientationLabel(root)}）说明问题有可启动的基础；现状位的${present.card.name}（${orientationLabel(present)}）显示当下仍有可操作空间；趋势位的${trend.card.name}（${orientationLabel(trend)}）是最后判断的关键，它把结果推向“能”。整体置信度为${confidence}。`
    : `因为这组三牌里，阻力大于助力。根源位的${root.card.name}（${orientationLabel(root)}）提示底层条件并不稳；现状位的${present.card.name}（${orientationLabel(present)}）说明当下推进会遇到卡点；趋势位的${trend.card.name}（${orientationLabel(trend)}）是最后判断的关键，它把结果压向“不能”。整体置信度为${confidence}。`;

  const localizedWhy = why.replace(`置信度为${confidence}。`, `置信度为${confidenceText}。`);

  const whatToDo = answer === "supportive"
    ? [
        actions.nextAction,
        themeText === "关系"
          ? "把需求说得更具体：你要什么、希望对方什么时候回应、你能接受的边界是什么。"
          : "把机会拆成一个最小可执行动作：目标、资源、时间点和验证标准都写清楚。",
        reversedCount > 0
          ? "先处理逆位牌指出的阻力，再加速推进；不要跳过不舒服的信号。"
          : "可以推进，但要保留复盘节点，不要因为答案是“能”就一次性押满。",
      ]
    : [
        "先暂停直接推进，把问题改成“什么条件满足后才可以”。",
        actions.avoid,
        themeText === "关系"
          ? "观察对方接下来的行为，而不是只听承诺；如果行为没有变化，就不要继续投入。"
          : "先降低投入规模，等证据、资源或合作条件变清楚后再重新判断。",
      ];

  return {
    answer,
    confidence,
    why: localizedWhy,
    whatToDo,
    score,
    scoreBreakdown,
    supportSignals,
    resistanceSignals,
    changeCondition,
  };
}

function riskNotes(cards: DrawnCard[]): string[] {
  return Array.from(new Set(cards.map((card) => `${card.card.name}: ${card.card.risk}`)));
}

export function interpretReading(reading: GeneratedReading): ReadingInterpretation {
  const cardSections = reading.cards.map((card) => interpretCard(card, reading.theme));
  const combination = combinationLayer(reading);
  const actions = buildActions(reading);
  const intent = reading.intent ?? detectQuestionIntent(reading.question, reading.theme);
  const verdict = buildVerdict(reading, actions, intent);

  return {
    intent,
    verdict,
    summary: `这次${themeName(reading.theme)}牌阵会把“${reading.question}”按“${intent.label}”来判断：${intent.judgmentPath} 这不是固定预言，而是趋势和信号模式。`,
    cardSections,
    combination,
    riskNotes: riskNotes(reading.cards),
    actions,
    disclaimer: "本解读仅供自我反思与娱乐参考，不构成医疗、法律、金融、心理健康或其他专业建议。",
  };
}

export function generateInterpretation(reading: GeneratedReading): Omit<ReadingInterpretation, "actions"> & {
  combined: string;
  riskNote: string;
  actionAdvice: string[];
  actions: string[];
} {
  const interpretation = interpretReading(reading);
  const actions = [
    interpretation.actions.nextAction,
    interpretation.actions.avoid,
    interpretation.actions.sevenDayObservation,
  ];

  return {
    ...interpretation,
    combined: interpretation.combination,
    riskNote: interpretation.riskNotes.join(" "),
    actionAdvice: actions,
    actions,
  };
}
