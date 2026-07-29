import { buildFallbackExplanation, type ExplanationInput } from "../../../lib/explanation.ts";

export async function POST(request: Request) {
  const input = (await request.json()) as Partial<ExplanationInput>;

  if (!input.idolName || !input.userTags || !input.matchedTags || !input.entryReasons) {
    return Response.json({ error: "Invalid explanation payload" }, { status: 400 });
  }

  return Response.json({
    mode: "fallback",
    explanation: buildFallbackExplanation(input as ExplanationInput)
  });
}
