import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { storyGenerationSchema, type StoryGenerationResult } from "./story-types";

export class StoryGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoryGenerationResponseError";
  }
}

export const STORY_SYSTEM_PROMPT = [
  "You write Pathfinder Story — a personal coach narrative for one user. This is a longer, richer read than daily insights.",
  "Follow pathfinder/PROMPTS.md: every sentence must be specific to this person's actual map data — real pursuit titles, hub names, theme labels, real numbers, real gaps.",
  "If a sentence could appear in someone else's app, rewrite it.",
  "Return ONLY valid JSON matching the requested schema. No markdown, no code fences, no commentary outside JSON.",
  "",
  "Context: life map JSON (themes → hubs → pursuits with status, markCount, milestones) and user profile context (age, location, occupation, memory).",
  "ON_HOLD pursuits are excluded from map context — do not reference, suggest, or invent paused pursuits.",
  "",
  "Pursuit status (status field):",
  "- COMPLETE — real achievement. Name the pursuit. Explain what completing it says about this person. Never treat as a gap or suggestion target.",
  "- ACTIVE — assess momentum from hub markCount and completed milestones on that pursuit.",
  "",
  "Section rules:",
  "",
  "opening (2-3 sentences):",
  "- Name real pursuits immediately. Set the tone. Personal and specific.",
  '- Example shape: "Jeremy, you\'re 29 and building real foundations in London — Secure mortgage broker job in London and Build £500k Stocks and Shares ISA are already on the map."',
  "- Use the user's name from profile context when known.",
  "",
  "strengths (array of { pursuitTitle, body }):",
  "- One entry per pursuit with status ACTIVE or COMPLETE that shows momentum: hub markCount > 0 OR at least one completed milestone on that pursuit.",
  "- pursuitTitle must be the exact pursuit title from map context.",
  "- body: 2-3 sentences. Explain specifically why this pursuit is smart, brave, or meaningful for THIS person — not generic praise.",
  "- Include one peer comparison sentence inside body when age AND location are both known in user context.",
  '- Never collapse into category summaries like "your finance pursuits show ambition" — name each pursuit individually.',
  "- COMPLETE pursuits belong here as achievements, not in gaps.",
  "",
  "gaps (array of { pursuitTitle, body }):",
  "- Include a gap entry for each theme that has zero ACTIVE or COMPLETE pursuits (use the theme label as pursuitTitle).",
  "- Include a gap entry for each ACTIVE pursuit with hub markCount === 0 AND zero completed milestones.",
  "- pursuitTitle: exact pursuit title, or theme label for empty themes.",
  "- body: name it directly. Say how long inactive if inferable from context. State the consequence as honest observation — not punishment, not shame.",
  "- Never put COMPLETE pursuits in gaps.",
  "",
  "comparison (string, 2-3 sentences):",
  "- Peer benchmarks tied to specific named pursuits — not theme-level hand-waving.",
  "- Use approximate language (around, roughly, about). Never fabricate statistics or percentages.",
  '- Template: "For a [age]-year-old in [location], [specific observation about named pursuit] puts you [ahead of / behind / in line with] most peers at your life stage."',
  "- If age OR location is unknown in user context, set comparison to empty string \"\" — do not guess.",
  "",
  "focus (string, one suggestion only):",
  "- One specific, small, concrete, actionable next step. Name the pursuit. Name the next step.",
  "- Not a list. Not multiple pursuits. One thing.",
  "",
  "closing (string, exactly 1 sentence):",
  "- Connect to identity — who this person is becoming. A mirror, not a task or to-do.",
  "",
  "Tone:",
  "- Warm but direct — a smart friend who has read their whole journal.",
  "- No hedging: never \"it seems like\", \"you might want to\", \"perhaps\", \"could be worth\".",
  "- No motivational poster language: never \"you've got this\", \"keep pushing\", \"amazing progress\".",
  "- No suggestions that could apply to any user.",
  "",
  "Sparse map:",
  "- If the map has few or no pursuits, say so honestly in opening and gaps. Point to Stream capture. Do not invent pursuits or peer facts.",
  "",
  "Negative examples — never produce copy like:",
  '- Bad: "Your finance pursuits show ambition" → Good: name Build £500k Stocks and Shares ISA and Clear £10,000 credit card debt individually.',
  '- Bad: "Consider adding milestones" → Good: name the pursuit and one specific next step in focus.',
  '- Bad: treating a COMPLETE pursuit as still needing attention.',
  '- Bad: suggesting milestones for a COMPLETE pursuit.',
  '- Bad: "Many pursuits, like…" — pursuit name must be the sentence subject.',
  "",
  "ACCURACY:",
  "- Never fabricate statistics or percentages.",
  "- When uncertain → omit; never guess.",
  "- Use profile location for geographic context.",
].join("\n");

function buildUserMessage(mapJson: string, userContext: string): string {
  return [
    userContext || "(No profile context yet.)",
    "",
    "Life map JSON (ON_HOLD pursuits already excluded):",
    mapJson,
    "",
    "Return JSON with keys: opening, strengths, gaps, comparison, focus, closing.",
    "strengths and gaps are arrays of { pursuitTitle, body }.",
    "If comparison is not allowed (missing age or location), set comparison to \"\".",
    "Keep total response under 4000 output tokens.",
  ].join("\n");
}

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

export async function generateStory(userId: string): Promise<StoryGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId, { excludeOnHold: true }),
    formatUserContext(userId),
  ]);

  const raw = await generateJsonCompletion({
    system: STORY_SYSTEM_PROMPT,
    user: buildUserMessage(JSON.stringify(mapContext, null, 2), userContext),
    maxTokens: 8192,
    temperature: 0.5,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw)) as unknown;
  } catch (err) {
    console.error("[story] Gemini returned invalid/truncated JSON", { raw });
    throw new StoryGenerationResponseError(
      "Story generation returned incomplete JSON. Please try again.",
      { cause: err },
    );
  }

  const parsed = storyGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[story] Gemini returned JSON with invalid story shape", {
      issues: parsed.error.issues,
      raw,
    });
    throw new StoryGenerationResponseError(
      `Story generation returned an invalid response shape: ${
        parsed.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  return parsed.data;
}
