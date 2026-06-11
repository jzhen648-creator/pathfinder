import { generateJsonCompletion } from "@/lib/gemini";
import type { FormattedPursuitContext } from "@/lib/ai/format-map-context";

const CONTEXT_QUESTIONS_SYSTEM = [
  "You help someone enrich their life map. Given everything you know about this pursuit and its owner, ask 2–3 specific questions that would help you understand their situation better.",
  "",
  "Register: second person, warm, curious — like a friend who already read their map, NOT a form or intake survey.",
  "",
  "BAD (form labels — never output these):",
  '- "What is your timeline?"',
  '- "Partner nationality?"',
  '- "Tell me more about this pursuit."',
  '- "Describe your goals."',
  "",
  "GOOD (conversational — target this register):",
  '- "Do you have a rough date in mind for the move?"',
  '- "Where is your partner based right now — still in Bangkok?"',
  '- "Have you started pulling together the financial evidence yet?"',
  '- "Are you looking to transition out of tech, or is mortgage advising a parallel track?"',
  "",
  "Rules:",
  "- Return ONLY valid JSON: { \"questions\": string[] } with exactly 2 or 3 strings.",
  "- Each question must reference something inferable from the context OR name the obvious unknown for THIS pursuit.",
  "- Never ask what context already answers (e.g. don't ask if it's active when status is ACTIVE).",
  "- Never use field-label phrasing (Timeline:, Status:, bullet questionnaires).",
  "- If status is ON_HOLD or PAUSED: softer reopening tone (e.g. what made you pause, still planning to pick it back up).",
  "- No markdown, no commentary outside JSON.",
].join("\n");

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

export async function generateContextQuestions(
  pursuitContext: FormattedPursuitContext,
  userContext: string,
  queueKey?: string | null,
): Promise<string[]> {
  const user = [
    userContext ? `User profile:\n${userContext}` : "(No profile context yet.)",
    "",
    "Pursuit context JSON:",
    JSON.stringify(pursuitContext, null, 2),
    "",
    'Return JSON: { "questions": [ "...", "..." ] } with 2–3 questions.',
  ].join("\n");

  const raw = await generateJsonCompletion({
    system: CONTEXT_QUESTIONS_SYSTEM,
    user,
    maxTokens: 256,
    temperature: 0.55,
    queueKey,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("Context questions response was not valid JSON.");
  }

  const questions = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) {
    throw new Error("Context questions missing questions array.");
  }

  const out = questions
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (out.length < 2) {
    throw new Error("Context questions returned fewer than 2 items.");
  }

  return out;
}
