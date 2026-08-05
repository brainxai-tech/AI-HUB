export const providerIds = ["openai"] as const;
export const outputFormatIds = ["teaching_bundle", "word", "ppt", "mind_map"] as const;

export const TEACHING_SYSTEM_PROMPT = [
  "你是面向学校教师、企业培训师和教研负责人的资深课程设计专家、教学评估专家与中文教育内容编辑。",
  "你的任务是把用户输入的知识点、授课对象、课时、难度、教学风格和补充要求，转化为可直接进入备课、培训设计或教研评审流程的高质量教学包。",
  "工作原则：先理解学习者已有基础和课堂约束，再设计教学目标、概念讲解、练习测验、错因诊断和教学活动；所有内容必须围绕同一知识点形成闭环，不要生成泛泛而谈的模板话术。",
  "教学质量要求：教学目标要可观察、可评估；讲义要包含概念边界、关键条件、正反例和迁移提示；测验要覆盖理解、辨析、应用和反思；答案必须与解析一致；错题解析必须逐题对应，并给出教师可使用的追问、讲解话术和补救练习。",
  "活动设计要求：活动必须适配授课对象、课时和真实教室或培训场景，写清时间、组织形式、步骤、材料和观察点；避免需要昂贵设备、复杂准备或与主题无关的热闹活动。",
  "安全与可信要求：不要编造教材出处、考试真题、政策要求、实时数据、研究结论或机构内部资料；涉及版权、考试、政策、医学、法律、财务等高风险内容时，必须提醒教师人工复核。",
  "输出格式要求：只返回 JSON 对象，不要返回 Markdown、解释文字、代码块或多余前后缀；必须满足调用方要求的字段结构，包含 sections.lecture、sections.quiz、sections.mistakeAnalysis、sections.activities、qualityChecks、teacherNotes。",
  "如果用户输入不完整，基于已有信息做保守、可复核的教学设计，不要向用户反问；在 teacherNotes 中标出关键假设和需要人工复核的地方。",
].join("\n");

export type ProviderId = (typeof providerIds)[number];
export type OutputFormatId = (typeof outputFormatIds)[number];
export type TeachingSource = ProviderId | "local-fallback";
export type QuizQuestionType = "single" | "multiple" | "true_false" | "short";

export interface TeachingRequest {
  topic: string;
  audience: string;
  durationMinutes: number;
  difficulty: string;
  teachingStyle: string;
  quizCount: number;
  provider: ProviderId;
  model?: string;
  outputFormat: OutputFormatId;
  includeExamples: boolean;
  extraRequirements?: string;
}

export interface LectureSection {
  title: string;
  objective: string;
  outline: string[];
  keyConcepts: string[];
  explanation: string;
  examples: string[];
  misconceptions: string[];
  boardPlan: string[];
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  stem: string;
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: string;
  checks: string;
}

export interface MistakeAnalysis {
  questionId: string;
  commonMistake: string;
  whyItHappens: string;
  teacherResponse: string;
  remediation: string;
}

export interface TeachingActivity {
  id: string;
  title: string;
  timing: string;
  mode: string;
  steps: string[];
  materials: string;
  assessmentCue: string;
}

export interface TeachingFormattedOutputs {
  word: string;
  ppt: string;
  mindMap: string;
}

export interface TeachingBundle {
  id: string;
  createdAt: string;
  source: TeachingSource;
  model: string;
  request: TeachingRequest;
  sections: {
    lecture: LectureSection;
    quiz: QuizQuestion[];
    mistakeAnalysis: MistakeAnalysis[];
    activities: TeachingActivity[];
  };
  formattedOutputs: TeachingFormattedOutputs;
  qualityChecks: string[];
  teacherNotes: string[];
}

type TeachingBundleContent = Omit<TeachingBundle, "formattedOutputs">;

export type TeachingValidationResult =
  | { ok: true; data: TeachingRequest }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
        details?: Record<string, string>;
      };
    };

const defaultModels: Record<ProviderId, string> = {
  openai: "gpt-5.4",
};

const allowedProviders = new Set<ProviderId>(providerIds);
const allowedOutputFormats = new Set<OutputFormatId>(outputFormatIds);
const quizTypes: QuizQuestionType[] = ["single", "multiple", "true_false", "short"];

const outputFormatPrompts: Record<OutputFormatId, string> = {
  teaching_bundle: "结果以完整教学包为主，讲义、测验、错题解析和教学活动都要完整。",
  word: "结果要适合整理成 Word 文档，层级清晰，段落说明充分，可直接给老师二次编辑。",
  ppt: "结果要适合整理成 PPT 课件，概念要拆成清晰页面，重点句短、层级明确。",
  mind_map: "结果要适合整理成思维导图，概念、误区、测验和活动之间的层级关系要清楚。",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, fallback = "", maxLength = 4000) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().replace(/\r\n/g, "\n").slice(0, maxLength);
}

function cleanTextArray(value: unknown, fallback: string[], maxItems = 12) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, "", 700))
    .filter(Boolean)
    .slice(0, maxItems);

  return items.length ? items : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}-${random}`;
}

export function validateTeachingRequest(input: unknown): TeachingValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请求内容不是有效对象。",
      },
    };
  }

  const details: Record<string, string> = {};
  const topic = cleanText(input.topic, "", 160);
  const audience = cleanText(input.audience, "", 120);
  const difficulty = cleanText(input.difficulty, "基础", 80);
  const teachingStyle = cleanText(input.teachingStyle, "讲练结合", 80);
  const requestedProvider = cleanText(input.provider, "", 40);
  const provider = allowedProviders.has(requestedProvider as ProviderId)
    ? (requestedProvider as ProviderId)
    : "openai";
  const outputFormat = allowedOutputFormats.has(input.outputFormat as OutputFormatId)
    ? (input.outputFormat as OutputFormatId)
    : "teaching_bundle";
  const durationMinutes = clampInteger(input.durationMinutes, 20, 180, 45);
  const quizCount = clampInteger(input.quizCount, 3, 12, 5);
  const model = cleanText(input.model, "", 120) || defaultModels[provider];

  if (!topic) {
    details.topic = "知识点不能为空。";
  }

  if (!audience) {
    details.audience = "授课对象不能为空。";
  }

  if (requestedProvider && !allowedProviders.has(requestedProvider as ProviderId)) {
    details.provider = "本项目只接受 Hub 的 GPT 路由。";
  }

  if (!/^gpt-/i.test(model)) {
    details.model = "本项目只允许调用 gpt-* 型号。";
  }

  if (Object.keys(details).length) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: details.topic || details.audience || details.provider || details.model || "请补全必填信息。",
        details,
      },
    };
  }

  return {
    ok: true,
    data: {
      topic,
      audience,
      durationMinutes,
      difficulty,
      teachingStyle,
      quizCount,
      provider,
      model,
      outputFormat,
      includeExamples: input.includeExamples !== false,
      extraRequirements: cleanText(input.extraRequirements, "", 1200),
    },
  };
}

function buildLecture(request: TeachingRequest): LectureSection {
  const exampleLine = request.includeExamples
    ? `用一个贴近 ${request.audience} 的生活或工作例子解释 ${request.topic}。`
    : `先给出 ${request.topic} 的定义，再给出边界条件。`;

  return {
    title: `${request.topic} 教学讲义`,
    objective: `让${request.audience}能解释${request.topic}的核心含义，并能在典型题目或任务中正确应用。`,
    outline: [
      "情境导入：用一个问题暴露已有认知",
      "概念拆解：定义、条件、适用边界",
      "示例推演：从简单样例过渡到变式",
      "即时练习：用短题检查理解",
      "总结迁移：归纳方法并连接下一课",
    ],
    keyConcepts: [
      `${request.topic} 的定义和关键条件`,
      `常见表示方式、判断标准或操作步骤`,
      `与相近概念的区别`,
      `在 ${request.difficulty} 场景下的应用要点`,
    ],
    explanation: [
      `${request.topic} 不宜只让学生背结论，应先让学生看到“为什么需要这个概念”。`,
      `讲解时采用${request.teachingStyle}：先给可观察现象，再抽象出规则，最后回到题目或任务。`,
      `本课时长 ${request.durationMinutes} 分钟，建议把教师讲授控制在一半以内，把练习、讨论和反馈留足。`,
    ].join("\n"),
    examples: [
      exampleLine,
      `设计一个正例和一个反例，让学生判断二者是否满足 ${request.topic} 的关键条件。`,
      `把原题改变一个条件，观察结论或解法是否发生变化。`,
    ],
    misconceptions: [
      `只记住 ${request.topic} 的表面结论，忽略成立条件。`,
      "把步骤当成原因，无法解释为什么这样做。",
      "遇到变式题时只套模板，不先识别问题结构。",
    ],
    boardPlan: [
      "左侧：情境问题和学生猜想",
      `中间：${request.topic} 的定义、条件和关键图示`,
      "右侧：例题步骤、错因提醒和课堂小结",
    ],
  };
}

function buildQuiz(request: TeachingRequest): QuizQuestion[] {
  return Array.from({ length: request.quizCount }, (_, index) => {
    const number = index + 1;
    const type = quizTypes[index % quizTypes.length];
    const base = {
      id: `q${number}`,
      type,
      difficulty: number <= 2 ? "基础" : number <= 5 ? "应用" : "提升",
      checks: `${request.topic} 的理解、辨析和应用`,
    };

    if (type === "single") {
      return {
        ...base,
        stem: `关于“${request.topic}”，下列哪一项最符合本课的核心判断？`,
        options: [
          "只要记住公式或结论即可",
          "先识别条件，再选择方法或解释结论",
          "所有题目都可以用同一个步骤处理",
          "只看关键词，不需要理解情境",
        ],
        answer: "B",
        explanation: `本课强调先识别 ${request.topic} 的成立条件，再选择对应方法。`,
      };
    }

    if (type === "multiple") {
      return {
        ...base,
        stem: `学习“${request.topic}”时，哪些做法有助于迁移应用？`,
        options: [
          "说出定义中的关键条件",
          "比较正例和反例",
          "只背最终答案",
          "解释每一步为什么成立",
        ],
        answer: "A、B、D",
        explanation: "迁移应用需要理解条件、辨析边界，并能解释推理过程。",
      };
    }

    if (type === "true_false") {
      return {
        ...base,
        stem: `判断：只要题目中出现“${request.topic}”相关关键词，就一定可以直接套用本课方法。`,
        options: ["正确", "错误"],
        answer: "错误",
        explanation: "关键词只能提示方向，仍需检查条件、对象和问题目标。",
      };
    }

    return {
      ...base,
      stem: `请用 2-3 句话说明“${request.topic}”的一个常见误区，并给出避免方法。`,
      answer: `先说明误区，再指出应检查定义、条件和目标。答案需体现对 ${request.topic} 的理解。`,
      explanation: "简答题用于检查学生能否用自己的语言解释错因和修正策略。",
    };
  });
}

function buildMistakeAnalysis(quiz: QuizQuestion[], topic: string): MistakeAnalysis[] {
  return quiz.map((question, index) => ({
    questionId: question.id,
    commonMistake:
      index % 2 === 0
        ? "看到关键词就直接套用步骤，没有检查条件。"
        : "能说出结论，但不能解释为什么该结论成立。",
    whyItHappens:
      index % 2 === 0
        ? `学生把 ${topic} 当成固定模板，缺少边界意识。`
        : "学生停留在记忆层，没有完成从例子到规则的抽象。",
    teacherResponse:
      index % 2 === 0
        ? "先让学生圈出题目条件，再追问“哪一个条件允许你这样做”。"
        : "请学生用自己的话补上推理链，并让同伴复述检查。",
    remediation:
      index % 2 === 0
        ? "提供一组只改变一个条件的变式题，训练条件识别。"
        : "让学生完成“结论-理由-例子”三列表格。",
  }));
}

function buildActivities(request: TeachingRequest): TeachingActivity[] {
  return [
    {
      id: "act-1",
      title: "三分钟情境投票",
      timing: "导入 3-5 分钟",
      mode: "全班快速互动",
      steps: [
        `展示一个与 ${request.topic} 有关的真实问题。`,
        "让学生先独立判断，再用举手或便签投票。",
        "选取两种不同观点，请学生说明理由。",
      ],
      materials: "投影、便签或在线投票工具",
      assessmentCue: "观察学生是否能说出判断依据，而不是只给答案。",
    },
    {
      id: "act-2",
      title: "正反例分拣",
      timing: "概念建立 8-10 分钟",
      mode: "小组协作",
      steps: [
        `给每组 4 个关于 ${request.topic} 的小案例。`,
        "学生将案例分为符合、不符合、需要更多信息三类。",
        "每组说出一个最有争议的判断并接受追问。",
      ],
      materials: "案例卡片、白板或协作表格",
      assessmentCue: "检查学生能否使用定义中的关键条件进行分类。",
    },
    {
      id: "act-3",
      title: "错因接力讲解",
      timing: "练习反馈 10-12 分钟",
      mode: "同伴互评",
      steps: [
        "教师展示一道典型错题和错误解法。",
        "第一位学生找错，第二位学生解释错因，第三位学生给修正方案。",
        "教师补充易错边界并形成课堂小结。",
      ],
      materials: "典型错题、投影或板书",
      assessmentCue: "看学生是否能把错误归因到概念、条件或步骤。",
    },
  ];
}

export function buildLocalTeachingBundle(request: TeachingRequest, reason?: string): TeachingBundle {
  const quiz = buildQuiz(request);
  const sourceNote = reason
    ? `当前为本地模板结果：${reason}`
    : "当前为本地模板草稿，仅用于格式化和测试，不作为生产生成兜底。";

  const bundle: TeachingBundleContent = {
    id: createId("bundle"),
    createdAt: new Date().toISOString(),
    source: "local-fallback",
    model: "local-template",
    request,
    sections: {
      lecture: buildLecture(request),
      quiz,
      mistakeAnalysis: buildMistakeAnalysis(quiz, request.topic),
      activities: buildActivities(request),
    },
    qualityChecks: [
      "讲义、测验、错题解析和教学活动已围绕同一知识点生成。",
      "测验题包含答案和解析，但正式使用前仍需教师复核。",
      "活动包含导入、概念建立和反馈三个课堂环节。",
    ],
    teacherNotes: [
      sourceNote,
      "AI 生成内容必须经过老师人工审核后再进入课堂或培训材料。",
      "若涉及教材原文、考试真题或机构内部资料，请确认版权和授权边界。",
    ],
  };

  return attachFormattedOutputs(bundle);
}

export function buildTeachingPrompt(request: TeachingRequest) {
  return [
    "请根据以下教学 brief 生成一个可编辑教学包。",
    "本条用户请求的具体约束如下：",
    `用户选择的输出形式：${request.outputFormat}。${outputFormatPrompts[request.outputFormat]}`,
    "无论输出形式是什么，仍必须返回标准教学包 JSON；后端会根据 JSON 派生 Word/PPT/思维导图稿件。",
    "请严格遵守 system prompt 中的质量、安全和 JSON 输出要求。",
    "教学 brief JSON：",
    JSON.stringify({
      topic: request.topic,
      audience: request.audience,
      durationMinutes: request.durationMinutes,
      difficulty: request.difficulty,
      teachingStyle: request.teachingStyle,
      quizCount: request.quizCount,
      outputFormat: request.outputFormat,
      includeExamples: request.includeExamples,
      extraRequirements: request.extraRequirements || "",
    }),
  ].join("\n");
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("MODEL_OUTPUT_NOT_JSON");
  }
}

function normalizeQuiz(value: unknown, fallback: QuizQuestion[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item, index): QuizQuestion | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = cleanText(item.id, `q${index + 1}`, 40);
      const type = quizTypes.includes(item.type as QuizQuestionType)
        ? (item.type as QuizQuestionType)
        : "single";
      const stem = cleanText(item.stem, "", 800);
      const answer = cleanText(item.answer, "", 500);
      const explanation = cleanText(item.explanation, "", 1000);

      if (!stem || !answer || !explanation) {
        return null;
      }

      return {
        id,
        type,
        stem,
        options: cleanTextArray(item.options, [], 8),
        answer,
        explanation,
        difficulty: cleanText(item.difficulty, "基础", 80),
        checks: cleanText(item.checks, "知识点理解", 200),
      };
    })
    .filter((item): item is QuizQuestion => item !== null);

  return normalized.length ? normalized : fallback;
}

export function normalizeTeachingBundle(
  value: unknown,
  request: TeachingRequest,
  source: Exclude<ProviderId, "local">,
  model: string,
): TeachingBundle {
  const fallback = buildLocalTeachingBundle(request, "模型输出结构不完整，已保留本地版本。");

  if (!isRecord(value) || !isRecord(value.sections)) {
    throw new Error("INVALID_TEACHING_BUNDLE");
  }

  const lectureValue = isRecord(value.sections.lecture) ? value.sections.lecture : {};
  const lecture: LectureSection = {
    title: cleanText(lectureValue.title, fallback.sections.lecture.title, 160),
    objective: cleanText(lectureValue.objective, fallback.sections.lecture.objective, 500),
    outline: cleanTextArray(lectureValue.outline, fallback.sections.lecture.outline),
    keyConcepts: cleanTextArray(lectureValue.keyConcepts, fallback.sections.lecture.keyConcepts),
    explanation: cleanText(lectureValue.explanation, fallback.sections.lecture.explanation, 4000),
    examples: cleanTextArray(lectureValue.examples, fallback.sections.lecture.examples),
    misconceptions: cleanTextArray(lectureValue.misconceptions, fallback.sections.lecture.misconceptions),
    boardPlan: cleanTextArray(lectureValue.boardPlan, fallback.sections.lecture.boardPlan),
  };
  const quiz = normalizeQuiz(value.sections.quiz, fallback.sections.quiz);

  const bundle: TeachingBundleContent = {
    id: createId("bundle"),
    createdAt: new Date().toISOString(),
    source,
    model,
    request,
    sections: {
      lecture,
      quiz,
      mistakeAnalysis: normalizeMistakes(value.sections.mistakeAnalysis, fallback.sections.mistakeAnalysis, quiz),
      activities: normalizeActivities(value.sections.activities, fallback.sections.activities),
    },
    qualityChecks: cleanTextArray(value.qualityChecks, fallback.qualityChecks),
    teacherNotes: [
      ...cleanTextArray(value.teacherNotes, []),
      "请在正式授课前由老师复核事实、答案、难度和版权边界。",
    ],
  };

  return attachFormattedOutputs(bundle);
}

function normalizeMistakes(value: unknown, fallback: MistakeAnalysis[], quiz: QuizQuestion[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item, index): MistakeAnalysis | null => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        questionId: cleanText(item.questionId, quiz[index]?.id || `q${index + 1}`, 40),
        commonMistake: cleanText(item.commonMistake, "", 800),
        whyItHappens: cleanText(item.whyItHappens, "", 800),
        teacherResponse: cleanText(item.teacherResponse, "", 800),
        remediation: cleanText(item.remediation, "", 800),
      };
    })
    .filter((item): item is MistakeAnalysis =>
      Boolean(item?.commonMistake && item.whyItHappens && item.teacherResponse && item.remediation),
    );

  return normalized.length ? normalized : fallback;
}

function normalizeActivities(value: unknown, fallback: TeachingActivity[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item, index): TeachingActivity | null => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        id: cleanText(item.id, `act-${index + 1}`, 40),
        title: cleanText(item.title, "", 160),
        timing: cleanText(item.timing, "", 120),
        mode: cleanText(item.mode, "", 120),
        steps: cleanTextArray(item.steps, [], 8),
        materials: cleanText(item.materials, "无需特殊材料", 300),
        assessmentCue: cleanText(item.assessmentCue, "", 500),
      };
    })
    .filter((item): item is TeachingActivity => Boolean(item?.title && item.steps.length));

  return normalized.length ? normalized : fallback;
}

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatMetadata(bundle: TeachingBundleContent) {
  return [
    `- 知识点：${bundle.request.topic}`,
    `- 授课对象：${bundle.request.audience}`,
    `- 课时：${bundle.request.durationMinutes} 分钟`,
    `- 难度：${bundle.request.difficulty}`,
    `- 教学风格：${bundle.request.teachingStyle}`,
    `- 输出形式：${bundle.request.outputFormat}`,
    `- 来源：${bundle.source} / ${bundle.model}`,
  ].join("\n");
}

function formatSlide(number: number, title: string, bullets: string[], notes?: string) {
  return [
    `# Slide ${number}: ${title}`,
    "",
    list(bullets),
    notes ? "" : null,
    notes ? `讲者备注：${notes}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function mindMapText(value: string, fallback: string) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[()[\]{}"']/g, "")
    .replace(/[:#`]/g, "")
    .trim()
    .slice(0, 56);

  return cleaned || fallback;
}

function attachFormattedOutputs(bundle: TeachingBundleContent): TeachingBundle {
  return {
    ...bundle,
    formattedOutputs: {
      word: formatWordDocumentMarkdown(bundle),
      ppt: formatPptMarkdown(bundle),
      mindMap: formatMindMapMarkdown(bundle),
    },
  };
}

export function formatLectureMarkdown(lecture: LectureSection) {
  return [
    `# ${lecture.title}`,
    "",
    `**教学目标**：${lecture.objective}`,
    "",
    "### 结构",
    list(lecture.outline),
    "",
    "### 核心概念",
    list(lecture.keyConcepts),
    "",
    "### 讲解",
    lecture.explanation,
    "",
    "### 示例",
    list(lecture.examples),
    "",
    "### 易错点",
    list(lecture.misconceptions),
    "",
    "### 板书设计",
    list(lecture.boardPlan),
  ].join("\n");
}

export function formatQuizMarkdown(quiz: QuizQuestion[]) {
  return quiz
    .map((question, index) =>
      [
        `### ${index + 1}. ${question.stem}`,
        question.options?.length ? list(question.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`)) : "",
        `**答案**：${question.answer}`,
        `**解析**：${question.explanation}`,
        `**考察点**：${question.checks}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function formatMistakesMarkdown(mistakes: MistakeAnalysis[]) {
  return mistakes
    .map((mistake) =>
      [
        `### ${mistake.questionId}`,
        `- 常见错误：${mistake.commonMistake}`,
        `- 错因：${mistake.whyItHappens}`,
        `- 讲解话术：${mistake.teacherResponse}`,
        `- 补救练习：${mistake.remediation}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export function formatActivitiesMarkdown(activities: TeachingActivity[]) {
  return activities
    .map((activity) =>
      [
        `### ${activity.title}`,
        `- 时间：${activity.timing}`,
        `- 形式：${activity.mode}`,
        `- 材料：${activity.materials}`,
        "- 步骤：",
        list(activity.steps),
        `- 观察点：${activity.assessmentCue}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export function formatWordDocumentMarkdown(bundle: TeachingBundleContent) {
  return [
    `# ${bundle.request.topic} Word 文档稿`,
    "",
    "## 课程信息",
    formatMetadata(bundle),
    "",
    "## 教学目标",
    bundle.sections.lecture.objective,
    "",
    "## 讲义正文",
    formatLectureMarkdown(bundle.sections.lecture),
    "",
    "## 课堂测验",
    formatQuizMarkdown(bundle.sections.quiz),
    "",
    "## 错题解析",
    formatMistakesMarkdown(bundle.sections.mistakeAnalysis),
    "",
    "## 教学活动安排",
    formatActivitiesMarkdown(bundle.sections.activities),
    "",
    "## 质量检查",
    list(bundle.qualityChecks),
    "",
    "## 老师备注",
    list(bundle.teacherNotes),
  ].join("\n");
}

export function formatPptMarkdown(bundle: TeachingBundleContent) {
  const lecture = bundle.sections.lecture;
  const quizBullets = bundle.sections.quiz
    .slice(0, 5)
    .map((question, index) => `${index + 1}. ${question.stem} 答案：${question.answer}`);
  const activityBullets = bundle.sections.activities.map(
    (activity) => `${activity.timing}：${activity.title}`,
  );
  const answerKey = bundle.sections.quiz.map((question, index) => `${index + 1}. ${question.answer}`);
  const slides = [
    formatSlide(1, bundle.request.topic, [
      `对象：${bundle.request.audience}`,
      `课时：${bundle.request.durationMinutes} 分钟`,
      `难度：${bundle.request.difficulty}`,
      `风格：${bundle.request.teachingStyle}`,
    ]),
    formatSlide(2, "教学目标", [lecture.objective], "开场时先把本节课能带走的能力说清楚。"),
    formatSlide(3, "课堂结构", lecture.outline),
    formatSlide(4, "核心概念", lecture.keyConcepts),
    formatSlide(5, "讲解主线", lecture.explanation.split("\n").filter(Boolean).slice(0, 4)),
    formatSlide(6, "示例与变式", lecture.examples),
    formatSlide(7, "常见误区", lecture.misconceptions),
    formatSlide(8, "课堂测验", quizBullets),
    formatSlide(9, "答案速览", answerKey),
    formatSlide(10, "教学活动", activityBullets),
    formatSlide(11, "板书与收束", lecture.boardPlan),
  ];

  return slides.join("\n\n");
}

export function formatMindMapMarkdown(bundle: TeachingBundleContent) {
  const topic = mindMapText(bundle.request.topic, "知识点");
  const lecture = bundle.sections.lecture;
  const conceptLines = lecture.keyConcepts
    .slice(0, 6)
    .map((item) => `      ${mindMapText(item, "核心概念")}`);
  const outlineLines = lecture.outline
    .slice(0, 6)
    .map((item) => `      ${mindMapText(item, "教学步骤")}`);
  const mistakeLines = lecture.misconceptions
    .slice(0, 5)
    .map((item) => `      ${mindMapText(item, "常见误区")}`);
  const quizLines = bundle.sections.quiz
    .slice(0, 6)
    .map((question) => `      ${mindMapText(question.checks, "测验考点")}`);
  const activityLines = bundle.sections.activities
    .slice(0, 5)
    .map((activity) => `      ${mindMapText(activity.title, "教学活动")}`);

  return [
    "```mermaid",
    "mindmap",
    `  root((${topic}))`,
    "    教学目标",
    `      ${mindMapText(lecture.objective, "目标")}`,
    "    核心概念",
    ...conceptLines,
    "    课堂结构",
    ...outlineLines,
    "    常见误区",
    ...mistakeLines,
    "    测验考点",
    ...quizLines,
    "    教学活动",
    ...activityLines,
    "```",
  ].join("\n");
}

export function formatSelectedOutputMarkdown(bundle: TeachingBundle, outputFormat: OutputFormatId) {
  if (outputFormat === "word") {
    return bundle.formattedOutputs?.word || formatWordDocumentMarkdown(bundle);
  }

  if (outputFormat === "ppt") {
    return bundle.formattedOutputs?.ppt || formatPptMarkdown(bundle);
  }

  if (outputFormat === "mind_map") {
    return bundle.formattedOutputs?.mindMap || formatMindMapMarkdown(bundle);
  }

  return formatBundleMarkdown(bundle);
}

export function formatBundleMarkdown(bundle: TeachingBundleContent) {
  return [
    `# ${bundle.request.topic} 教学包`,
    "",
    `- 授课对象：${bundle.request.audience}`,
    `- 课时：${bundle.request.durationMinutes} 分钟`,
    `- 难度：${bundle.request.difficulty}`,
    `- 风格：${bundle.request.teachingStyle}`,
    `- 输出形式：${bundle.request.outputFormat}`,
    `- 来源：${bundle.source} / ${bundle.model}`,
    "",
    "## 讲义",
    formatLectureMarkdown(bundle.sections.lecture),
    "",
    "## 测验",
    formatQuizMarkdown(bundle.sections.quiz),
    "",
    "## 错题解析",
    formatMistakesMarkdown(bundle.sections.mistakeAnalysis),
    "",
    "## 教学活动",
    formatActivitiesMarkdown(bundle.sections.activities),
    "",
    "## 质量检查",
    list(bundle.qualityChecks),
    "",
    "## 老师备注",
    list(bundle.teacherNotes),
  ].join("\n");
}
