import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { formatThemeDisplayNamesForPrompt } from "@/lib/life-areas";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { sanitizeStoryGeneration } from "./sanitize-story";
import { storyGenerationSchema, type StoryGenerationResult } from "./story-types";

export class StoryGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoryGenerationResponseError";
  }
}

export const STORY_SYSTEM_PROMPT = [
  "You write Pathfinder Story — a plain-language summary of one user's life map. This is a longer read than daily insights, but it must read like an accurate briefing, not flattery or life coaching.",
  "Follow pathfinder/PROMPTS.md (Story section): every sentence must be specific to this person's actual map data — real pursuit titles, hub names, theme labels, real numbers, real gaps.",
  "If a sentence could appear in someone else's app, rewrite it.",
  "Return ONLY valid JSON matching the requested schema. No markdown, no code fences, no commentary outside JSON.",
  "",
  "Context: life map JSON (themes → hubs → pursuits with status, markCount, milestones) and user profile context (age, location, occupation, memory).",
  "ON_HOLD pursuits are excluded from map context — do not reference, suggest, or invent paused pursuits.",
  "",
  "Theme display names (use exactly in prose — map JSON theme.label is authoritative):",
  formatThemeDisplayNamesForPrompt(),
  "- Theme id `becoming` is always **Self & Mind** in user-facing copy. Never write Who I'm Becoming, Who im becoming, Mind & Spirit, Personal Growth, or use \"who you are becoming\" as a theme name.",
  "",
  "GROUND TRUTH — never violate:",
  "- Reference ONLY pursuits, hubs, themes, marks, milestones, and profile fields actually present in the provided map JSON and user context.",
  "- Never infer, embellish, or invent a connection, trait, habit, or life detail that is not supported by that data.",
  "- If the map does not show evidence (markCount, completed milestones, status, stated target), do not claim momentum, discipline, ambition, or \"setting you apart\".",
  "- Stripping praise is not permission to fill gaps with invention: plain and accurate beats confident and invented.",
  "- When uncertain → omit; never guess peer facts, timelines, or statistics.",
  "",
  "Pursuit status (status field):",
  "- COMPLETE — name the pursuit and state completion as a map fact. Do not interpret character or life trajectory. Never treat as a gap or suggestion target.",
  "- ACTIVE — describe what the map shows: hub markCount and completed milestones on that pursuit.",
  "",
  "Voice and context:",
  "- Describe what the map shows in plain language. Do NOT praise, flatter, or editorialise (no: ambitious, driven, disciplined, impressive, sets you apart, strong indicator, rare, uncommon unless tied to a named map fact).",
  "- Use each profile context fact (age, location, occupation, life stage) AT MOST ONCE across the entire JSON output — pick one section (opening OR comparison) or omit; never restate in strengths, gaps, or closing.",
  "- Do NOT inject a peer-comparison sentence into any strength body.",
  "- Tone: calm and direct — a clear summary of their map, not a cheerleader or coach selling potential.",
  "- No hedging: never \"it seems like\", \"you might want to\", \"perhaps\", \"could be worth\".",
  "- No motivational poster language: never \"you've got this\", \"keep pushing\", \"amazing progress\".",
  "- No suggestions that could apply to any user.",
  "",
  "Section rules:",
  "",
  "opening (2-3 sentences):",
  "- Name real pursuits by exact title from map context. Optional: use display name once if known.",
  "- State plainly what is on the map (status, hub, markCount, completed milestones) — not why it is impressive.",
  "- Do NOT use this section to introduce age, location, and occupation together as a persona label (e.g. \"London-based professional in your late twenties\") unless that is the single place those facts appear in the whole reading.",
  '- Neutral example shape: "[Name], [Exact pursuit A] and [Exact pursuit B] are on your map under [hub/theme] — [one fact from status/marks/milestones]."',
  "- Do not copy the Jeremy / 29 / London example; it is retired.",
  "",
  "strengths (array of { pursuitTitle, body }):",
  "- One entry per pursuit with status ACTIVE or COMPLETE that shows momentum: hub markCount > 0 OR at least one completed milestone on that pursuit.",
  "- pursuitTitle must be the exact pursuit title from map context.",
  "- body: 2-3 sentences. Report evidence from the map only: status, hub markCount, completed milestones, pursuit title/description if present.",
  "- Say what is active or complete and what the data shows — not that it is smart, brave, meaningful, ambitious, or unusual.",
  "- No peer comparison inside strength bodies.",
  "- COMPLETE pursuits belong here as achievements, not in gaps.",
  '- Never collapse into category summaries like "your finance pursuits show ambition" — name each pursuit individually.',
  "",
  "gaps (array of { pursuitTitle, body }):",
  "- Include a gap entry for each theme that has zero ACTIVE or COMPLETE pursuits (use the theme label as pursuitTitle).",
  "- Include a gap entry for each ACTIVE pursuit with hub markCount === 0 AND zero completed milestones.",
  "- pursuitTitle: exact pursuit title, or theme label for empty themes.",
  "- body: name it directly. Say how long inactive if inferable from context. State the consequence as honest observation — not punishment, not shame.",
  "- Never put COMPLETE pursuits in gaps.",
  "",
  "comparison (string, 0-2 sentences OR empty string):",
  "- Optional. Use only if age AND location are both known in user context AND you have not already stated age or location anywhere else in this reading.",
  "- At most one neutral, non-flattering framing tied to ONE named pursuit — approximate language only; never fabricate statistics or percentages.",
  "- Do not use: ahead of peers, sets you apart, strong indicator, impressive, ambitious, driven, disciplined.",
  "- If age OR location is unknown, OR already used in opening, set comparison to \"\".",
  "",
  "focus (string, one suggestion only):",
  "- One specific, small, concrete, actionable next step. Name the pursuit. Name the next step.",
  "- Not a list. Not multiple pursuits. One thing.",
  "",
  "closing (string, exactly 1 sentence):",
  "- One plain sentence tied to a named pursuit or theme on the map — what the data shows about current direction, not character praise or \"who you are becoming\" unless COMPLETE/milestone evidence is named in the same sentence.",
  "",
  "Sparse map:",
  "- If the map has few or no pursuits, say so honestly in opening and gaps. Point to Stream capture. Do not invent pursuits or peer facts.",
  "",
  "Negative examples — never produce copy like:",
  '- Bad: "Your finance pursuits show ambition" → Good: name Build £500k Stocks and Shares ISA and Clear £10,000 credit card debt individually.',
  '- Bad: "a focused drive that sets you apart" / "a strong indicator of ambition" → Good: cite markCount, milestones, or COMPLETE status on a named pursuit.',
  '- Bad: "London-based professional in your late twenties" in opening AND "someone your age in London" in comparison → Good: use age OR location once in the entire reading, or omit.',
  '- Bad: praising discipline or momentum with no marks and no completed milestones on that pursuit.',
  '- Bad: "Consider adding milestones" → Good: name the pursuit and one specific next step in focus.',
  '- Bad: treating a COMPLETE pursuit as still needing attention.',
  '- Bad: suggesting milestones for a COMPLETE pursuit.',
  '- Bad: "Many pursuits, like…" — pursuit name must be the sentence subject.',
].join("\n");

function buildUserMessage(mapJson: string, userContext: string): string {
  return [
    userContext || "(No profile context yet.)",
    "",
    "Theme labels for prose (never substitute retired names for becoming):",
    formatThemeDisplayNamesForPrompt(),
    "",
    "Life map JSON (ON_HOLD pursuits already excluded):",
    mapJson,
    "",
    "Return JSON with keys: opening, strengths, gaps, comparison, focus, closing.",
    "strengths and gaps are arrays of { pursuitTitle, body }.",
    "If comparison is not allowed (missing age or location), set comparison to \"\".",
    "If age or location already appears in opening, set comparison to \"\".",
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

  return sanitizeStoryGeneration(parsed.data);
}
