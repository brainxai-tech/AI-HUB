import { z } from "zod";

export const providerLabels = {
  demo: "本地预览",
  openai: "GPT · AI Routing"
} as const;

export const providerSchema = z.enum(["demo", "openai"]);
export const realProviderSchema = z.enum(["openai"]);

export const defaultModels = {
  demo: "local-demo",
  openai: "gpt-5.4"
} as const;

export const modelSuggestions = {
  demo: ["local-demo"],
  openai: ["gpt-5.4"]
} as const;

export const toneSchema = z.enum([
  "sharp-professional",
  "calm-premium",
  "bold-growth",
  "warm-human",
  "minimal-technical"
]);

export const languageSchema = z.enum(["zh-CN", "en-US", "bilingual"]);
export const landingPageStyleSchema = z.enum(["problem", "outcome", "identity", "comparison"]);
export const focusSchema = z.enum([
  "full",
  "brandNames",
  "positioning",
  "taglines",
  "personas",
  "landingPageDirections",
  "landingPageCopy"
]);

export const generationInputSchema = z.object({
  idea: z.string().trim().min(10, "请至少输入一个具体产品想法。").max(4000),
  targetAudience: z.string().trim().max(800).optional().default(""),
  market: z.string().trim().max(300).optional().default(""),
  tone: toneSchema.default("sharp-professional"),
  language: languageSchema.default("zh-CN"),
  landingPageStyle: landingPageStyleSchema.default("problem")
});

export const generateBrandPackRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(120),
  focus: focusSchema.optional().default("full"),
  input: generationInputSchema
}).superRefine((value, context) => {
  if (value.provider === "openai" && !/^gpt-/i.test(value.model)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["model"], message: "本项目只允许调用 gpt-* 型号。" });
  }
});

const nonEmptyString = z.string().trim().min(1);

export const brandNameSchema = z.object({
  name: nonEmptyString,
  tagline: nonEmptyString,
  rationale: nonEmptyString,
  fit: z.enum(["SAFE", "BOLD", "PREMIUM", "TECHNICAL", "PLAYFUL"])
});

export const positioningSchema = z.object({
  oneLiner: nonEmptyString,
  category: nonEmptyString,
  targetUser: nonEmptyString,
  primaryPromise: nonEmptyString,
  differentiation: nonEmptyString,
  proofIdea: nonEmptyString,
  assumptions: z.array(nonEmptyString).min(3).max(6)
});

export const taglineSchema = z.object({
  style: z.enum(["RATIONAL", "EMOTIONAL", "CONVERSION"]),
  line: nonEmptyString
});

export const personaSchema = z.object({
  name: nonEmptyString,
  segment: nonEmptyString,
  context: nonEmptyString,
  pains: z.array(nonEmptyString).min(3).max(5),
  trigger: nonEmptyString,
  objection: nonEmptyString,
  acquisitionChannel: nonEmptyString
});

export const landingPageDirectionSchema = z.object({
  name: nonEmptyString,
  angle: nonEmptyString,
  bestFor: nonEmptyString,
  heroHeadline: nonEmptyString,
  sectionPlan: z.array(nonEmptyString).min(4).max(7)
});

export const landingPageCopySchema = z.object({
  hero: z.object({
    headline: nonEmptyString,
    subheadline: nonEmptyString,
    primaryCta: nonEmptyString,
    secondaryCta: nonEmptyString
  }),
  problemSection: z.object({
    title: nonEmptyString,
    bullets: z.array(nonEmptyString).min(3).max(5)
  }),
  solutionSection: z.object({
    title: nonEmptyString,
    body: nonEmptyString
  }),
  featureBlocks: z.array(z.object({
    title: nonEmptyString,
    body: nonEmptyString
  })).min(3).max(5),
  socialProof: z.object({
    title: nonEmptyString,
    body: nonEmptyString
  }),
  faq: z.array(z.object({
    question: nonEmptyString,
    answer: nonEmptyString
  })).min(3).max(5),
  finalCta: z.object({
    headline: nonEmptyString,
    button: nonEmptyString
  })
});

export const validationPlanSchema = z.object({
  northStarMetric: nonEmptyString,
  firstExperiment: nonEmptyString,
  successSignals: z.array(nonEmptyString).min(3).max(5),
  risks: z.array(nonEmptyString).min(3).max(5)
});

export const brandPackSchema = z.object({
  brandNames: z.array(brandNameSchema).min(3).max(5),
  positioning: positioningSchema,
  taglines: z.array(taglineSchema).min(9).max(12),
  personas: z.array(personaSchema).length(3),
  landingPageDirections: z.array(landingPageDirectionSchema).length(3),
  landingPageCopy: landingPageCopySchema,
  validationPlan: validationPlanSchema
});

export type Provider = z.infer<typeof providerSchema>;
export type RealProvider = z.infer<typeof realProviderSchema>;
export type Tone = z.infer<typeof toneSchema>;
export type Language = z.infer<typeof languageSchema>;
export type LandingPageStyle = z.infer<typeof landingPageStyleSchema>;
export type Focus = z.infer<typeof focusSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerateBrandPackRequest = z.infer<typeof generateBrandPackRequestSchema>;
export type BrandPack = z.infer<typeof brandPackSchema>;

export type GenerateBrandPackResponse = {
  data: BrandPack;
  meta: {
    provider: Provider;
    model: string;
    mode: "demo" | "model";
    focus: Focus;
    generatedAt: string;
  };
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
