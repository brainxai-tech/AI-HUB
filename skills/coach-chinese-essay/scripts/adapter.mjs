const GRADES = new Set(["初一", "初二", "初三", "高一", "高二", "高三"]);
const GENRES = new Set(["记叙文", "议论文", "材料作文"]);
const SCENES = new Set(["日常练习", "课堂作业", "考前训练"]);

export const adapter = {
  async start({ input, client }) {
    const essay = validateEssayInput(input?.essay);
    const analysis = await client.requestJson("essay", "/api/analyze", {
      method: "POST",
      body: { input: essay },
    });
    return {
      status: "waiting",
      step: "collect-materials",
      checkpoint: {
        id: "collect-materials",
        title: "补充真实素材",
        instructions: "回答审题结果中的素材追问，只填写真实经历、具体细节和自己的感悟。",
        requiredFields: ["materials.experience", "materials.detail", "materials.insight"],
        questions: analysis?.data?.questions || [],
      },
      context: { essay, analysis },
    };
  },

  async resume({ run, input, checkpointId, client }) {
    if (checkpointId === "collect-materials") {
      const materials = validateMaterials(input?.materials);
      const outlines = await client.requestJson("essay", "/api/outlines", {
        method: "POST",
        body: {
          input: run.context.essay,
          analysis: run.context.analysis.data,
          materials,
        },
      });
      return {
        status: "waiting",
        step: "select-outline",
        checkpoint: {
          id: "select-outline",
          title: "选择提纲",
          instructions: "比较稳妥型、个性型和提分型提纲，明确选择一个后再成文。",
          requiredFields: ["outlineId"],
          options: outlines?.data?.outlines || [],
        },
        context: { ...run.context, materials, outlines },
      };
    }

    if (checkpointId === "select-outline") {
      const selectedOutline = selectOutline(run.context.outlines?.data?.outlines, input);
      const essayResult = await client.requestJson("essay", "/api/compose", {
        method: "POST",
        body: {
          input: run.context.essay,
          materials: run.context.materials,
          outline: selectedOutline,
        },
      });
      const context = { ...run.context, selectedOutline, essayResult };
      return {
        status: "completed",
        step: "compose",
        context,
        result: {
          analysis: context.analysis,
          materials: context.materials,
          outlines: context.outlines,
          selectedOutline,
          essay: essayResult,
        },
      };
    }
    throw validationError("未知的作文工作流检查点。");
  },
};

function validateEssayInput(value) {
  if (!value || typeof value !== "object") throw validationError("缺少 essay 输入。");
  const prompt = requiredText(value.prompt, "作文题目", 20_000);
  if (!GRADES.has(value.grade)) throw validationError("年级无效。");
  if (!GENRES.has(value.genre)) throw validationError("作文体裁无效。");
  if (!SCENES.has(value.scene)) throw validationError("练习场景无效。");
  const targetLength = Number(value.targetLength);
  if (!Number.isInteger(targetLength) || targetLength < 400 || targetLength > 1500) {
    throw validationError("目标字数必须为 400—1500 的整数。");
  }
  return {
    prompt,
    grade: value.grade,
    genre: value.genre,
    targetLength,
    includePunctuation: value.includePunctuation !== false,
    scene: value.scene,
  };
}

function validateMaterials(value) {
  if (!value || typeof value !== "object") throw validationError("缺少真实素材回答。");
  return {
    experience: requiredText(value.experience, "真实经历", 3000),
    detail: requiredText(value.detail, "具体细节", 3000),
    insight: requiredText(value.insight, "个人感悟", 3000),
  };
}

function selectOutline(outlines, input) {
  if (!Array.isArray(outlines) || !outlines.length) throw validationError("没有可选择的提纲。");
  if (input?.outline && typeof input.outline === "object") {
    const match = outlines.find((item) => item.id === input.outline.id);
    if (match) return match;
  }
  const id = requiredText(input?.outlineId, "提纲 ID", 160);
  const selected = outlines.find((item) => item.id === id);
  if (!selected) throw validationError("选择的提纲不存在。");
  return selected;
}

function requiredText(value, label, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw validationError(`${label}不能为空。`);
  return text.slice(0, maxLength);
}

function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.status = 422;
  return error;
}
