import { generateJsonCompletion } from "@/lib/gemini";
import { replacePursuitContextDescription } from "@/lib/pursuit/pursuit-title";
import { syncFinanceMetricsFromProse } from "@/lib/pursuit/pursuit-finance";
import type { FormattedPursuitContext } from "@/lib/ai/format-map-context";
import { prisma } from "@/lib/prisma";

const APPLY_CONTEXT_SYSTEM = [
  "You merge a user's note into the living context for a life-map pursuit.",
  "Return ONLY valid JSON: { \"description\": string }.",
  "",
  "Rules:",
  "- description: 2–4 plain sentences integrating existing context with the new note.",
  "- Rewrite as one coherent summary — do not append duplicate paragraphs.",
  "- Preserve specific facts, numbers, dates, and names from both sources.",
  "- Do not invent facts not in the input or existing context.",
  "- Do not reference other pursuits, sibling goals, or cross-theme life events unless the user's note explicitly mentions them.",
  "- Pursuit context JSON may list sibling pursuits for routing only — never weave their facts into description.",
  "- Do not change the pursuit title or suggest milestones.",
  "- No markdown, no bullet lists.",
].join("\n");

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

export async function applyPursuitContextNote(input: {
  pursuitContext: FormattedPursuitContext;
  userContext: string;
  note: string;
  existingDescription: string | null;
  goalId: string;
  themeId: string;
  queueKey?: string | null;
}): Promise<string> {
  const user = [
    input.userContext ? `User profile:\n${input.userContext}` : "",
    "",
    "Pursuit context JSON:",
    JSON.stringify(input.pursuitContext, null, 2),
    "",
    input.existingDescription?.trim()
      ? `Existing context:\n${input.existingDescription.trim()}`
      : "Existing context: (none)",
    "",
    "User note to merge:",
    input.note.trim(),
    "",
    'Return JSON: { "description": "..." }',
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generateJsonCompletion({
    system: APPLY_CONTEXT_SYSTEM,
    user,
    maxTokens: 512,
    temperature: 0.35,
    queueKey: input.queueKey,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("Apply context response was not valid JSON.");
  }

  const description = (parsed as { description?: unknown }).description;
  if (typeof description !== "string" || !description.trim()) {
    throw new Error("Apply context produced empty description.");
  }

  const replaced = replacePursuitContextDescription(
    input.existingDescription,
    description.trim().slice(0, 500),
  );

  const financePatch =
    input.themeId === "finance"
      ? syncFinanceMetricsFromProse(replaced)
      : {};

  await prisma.goal.update({
    where: { id: input.goalId },
    data: {
      description: replaced,
      ...financePatch,
    },
  });

  return replaced;
}
