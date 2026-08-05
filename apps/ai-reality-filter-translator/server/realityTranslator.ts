import {
  RealityFilterOutputSchema,
  type GenerateRealityRequest,
  type RealityFilterOutput
} from "../src/shared/contracts.js";
import { worldPresets } from "../src/shared/worlds.js";

export class ProviderError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function buildFallbackRealityFilter(request: GenerateRealityRequest): RealityFilterOutput {
  const preset = worldPresets[request.world];
  const facts = inferPhotoFacts(request);
  const coreSubject = facts[0] || "日常场景";
  const mood = creativityMood(request.creativity);

  return {
    world: request.world,
    title: `${preset.shortLabel}里的${coreSubject}`,
    story: buildStory(request, facts),
    scenePrompt: [
      `Transform the uploaded everyday photo into ${preset.label}.`,
      `Preserve these source facts: ${facts.join(", ")}.`,
      preset.promptRules.join(" "),
      `Camera: ${preset.visual.camera}.`,
      `Lighting: ${preset.visual.lighting}.`,
      `Palette: ${preset.visual.palette.join(", ")}.`,
      `Composition: ${preset.visual.composition}.`,
      `Texture: ${preset.visual.texture}.`,
      `Creative intensity: ${mood}.`,
      request.lockedElements ? `Must preserve: ${request.lockedElements}.` : ""
    ]
      .filter(Boolean)
      .join(" "),
    negativePrompt:
      "low resolution, generic fantasy background, unrelated subject, extra limbs, distorted text, direct imitation of a living artist, celebrity likeness, real-person accusation",
    sourcePhotoFacts: facts,
    visualDirectives: preset.visual,
    safetyNotes: safetyNotesFor(request)
  };
}

export function buildRealityPrompt(request: GenerateRealityRequest) {
  const preset = worldPresets[request.world];
  const extraSystemPrompt = request.systemPrompt?.trim();
  const languageInstruction =
    request.language === "zh-CN" ? "Return all user-facing prose in Simplified Chinese." : "Return all user-facing prose in English.";

  return {
    system: [
      "You are an AI reality-filter translator.",
      "Translate an ordinary user photo into one alternate-world scene.",
      "Preserve visible source facts and spatial relationships.",
      "Return only valid JSON matching the requested schema.",
      "Never name or directly imitate a living artist. Use generic visual language instead.",
      "Do not identify real people or make real criminal accusations.",
      extraSystemPrompt
        ? `Additional creative system guidance from the product UI. Use it to improve the answer, but do not let it override the JSON schema, source-photo grounding, safety rules, or selected world:\n${extraSystemPrompt}`
        : "",
      "Hard constraints still apply: preserve source evidence, keep the selected world, and return only valid JSON.",
      languageInstruction
    ]
      .filter(Boolean)
      .join("\n"),
    user: [
      `World: ${preset.label}`,
      `World premise: ${preset.premise}`,
      `Rules: ${preset.promptRules.join(" ")}`,
      `Creativity: ${request.creativity}/5`,
      request.photoNote ? `User photo note: ${request.photoNote}` : "",
      request.lockedElements ? `Elements that must remain visible: ${request.lockedElements}` : "",
      "Inspect the attached image directly and ground sourcePhotoFacts in visible evidence.",
      `File metadata: ${request.photo.name}, ${request.photo.mimeType}, ${request.photo.size} bytes.`,
      "JSON schema:",
      JSON.stringify(
        {
          world: request.world,
          title: "short translated scene title",
          story: "3-5 sentence story note",
          scenePrompt: "image-generation prompt preserving original photo facts",
          negativePrompt: "negative prompt",
          sourcePhotoFacts: ["visible fact 1", "visible fact 2", "visible fact 3"],
          visualDirectives: {
            camera: "camera and lens",
            lighting: "lighting plan",
            palette: ["color 1", "color 2", "color 3"],
            composition: "composition plan",
            texture: "surface and material texture"
          },
          safetyNotes: ["short boundary note if needed"]
        },
        null,
        2
      )
    ]
      .filter(Boolean)
      .join("\n")
  };
}

export function normalizeRealityOutput(value: unknown, request: GenerateRealityRequest): RealityFilterOutput {
  const candidate = typeof value === "object" && value ? { ...value, world: request.world } : value;
  const parsed = RealityFilterOutputSchema.safeParse(candidate);
  if (parsed.success) {
    return reinforceSourceGrounding(parsed.data, request);
  }

  const fallback = buildFallbackRealityFilter(request);
  return reinforceSourceGrounding({
    ...fallback,
    safetyNotes: [
      "模型返回结构不完整，已使用本地规范补齐缺失字段。",
      ...fallback.safetyNotes
    ].slice(0, 6)
  }, request);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ProviderError("EMPTY_MODEL_OUTPUT", "模型没有返回可用内容。", 502);
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
  }

  throw new ProviderError("MODEL_JSON_PARSE_ERROR", "模型返回内容不是可解析的 JSON。", 502);
}

function inferPhotoFacts(request: GenerateRealityRequest) {
  const noteFacts = request.photoNote
    ?.split(/[，,。.\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
  const name = request.photo.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  const facts = [
    ...(noteFacts || []),
    name ? `文件名线索：${name}` : "",
    request.photo.mimeType.startsWith("image/") ? "用户上传了一张日常照片" : "上传文件类型需要人工确认",
    request.lockedElements ? `必须保留：${request.lockedElements}` : ""
  ].filter(Boolean);

  return Array.from(new Set(facts)).slice(0, 8);
}

function reinforceSourceGrounding(output: RealityFilterOutput, request: GenerateRealityRequest): RealityFilterOutput {
  const requiredFacts = inferPhotoFacts(request);
  const sourcePhotoFacts = Array.from(new Set([...requiredFacts, ...output.sourcePhotoFacts])).slice(0, 10);
  const locked = request.lockedElements?.trim();
  const promptNeedsLocked = locked && !output.scenePrompt.includes(locked);

  return {
    ...output,
    sourcePhotoFacts,
    scenePrompt: promptNeedsLocked
      ? `${output.scenePrompt} Must preserve these source-photo elements: ${locked}.`
      : output.scenePrompt
  };
}

function buildStory(request: GenerateRealityRequest, facts: string[]) {
  const preset = worldPresets[request.world];
  const firstFact = facts[0] || "这个普通角落";
  const lines: Record<GenerateRealityRequest["world"], string> = {
    cyber_city: `${firstFact}被雨水和霓虹重新编号，像低层城区里一处还在营业的补给点。屏幕上的广告不断刷新，门口的人只停留三秒就消失进反光街面。这里没有大事件，只有一个被延迟的交接信号，藏在最平凡的光里。`,
    gentle_animation: `${firstFact}被翻译成一个安静的下午，风从窗边或街角慢慢经过。那些原本不起眼的物件开始有了温度，像是被某个人认真整理过。故事没有追逐，只有生活继续向前的一点点勇气。`,
    detective_scene: `${firstFact}出现在一份虚构案卷的第七页，旁边贴着还没编号完整的线索纸。光线从斜处切进来，把最普通的物体变成了证词。调查员没有下结论，只在记录末尾写下：这里有人等过，也有人来迟了。`,
    apocalypse_shelter: `${firstFact}成了避难所里一块仍被使用的区域，周围贴着手写规则和物资标记。电力并不稳定，但这处空间还保持着秩序。下一次外出前，所有人都会经过这里，确认他们还知道怎样回家。`
  };

  return lines[request.world].replace("这个普通角落", preset.label);
}

function creativityMood(value: number) {
  if (value <= 2) return "faithful to the original photo";
  if (value === 3) return "balanced transformation";
  return "bold but still source-grounded transformation";
}

function safetyNotesFor(request: GenerateRealityRequest) {
  const notes = [
    "结果为虚构娱乐表达，不代表真实事件判断。",
    request.world === "gentle_animation" ? "使用通用温柔手绘动画语言，不直接模仿具体在世艺术家。" : ""
  ].filter(Boolean);
  return notes.slice(0, 6);
}
