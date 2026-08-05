import { z } from "zod";
import { interpretationStyles, providers } from "../shared/types";

export const InterpretRequestSchema = z
  .object({
    dreamText: z
      .string()
      .trim()
      .min(8, "梦境内容至少需要 8 个字符。")
      .max(3000, "梦境内容最多 3000 个字符。"),
    mood: z.string().trim().max(40).optional().or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(20)).max(8).optional(),
    style: z.enum(interpretationStyles),
    provider: z.enum(providers),
    model: z.string().trim().regex(/^gpt-/i, "本项目只允许调用 gpt-* 型号。")
  }).strict()
  .transform((input) => ({
    ...input,
    mood: input.mood || undefined,
    tags: input.tags?.filter(Boolean) ?? []
  }));

export type ParsedInterpretRequest = z.infer<typeof InterpretRequestSchema>;
