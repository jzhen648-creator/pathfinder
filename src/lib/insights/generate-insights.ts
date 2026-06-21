import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
import { pursuitStatusPromptBlock } from "@/lib/ai/pursuit-status-prompt";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { z } from "zod";
import {
  insightGenerationSchema,
  insightLevelSchema,
  pursuitInsightSchema,
  type InsightGenerationResult,
  type InsightLevelPayload,
} from "./insight-types";
import { clampInsightGenerationJson } from "./clamp-insight-json";
import { gateThemeInsightsPatch } from "@/lib/insights/gate-theme-insights";
import {
  TENSION_NOT_FORECAST_RULE,
  VOICE_EVALUATIVE_ANTI_PATTERNS,
} from "@/lib/insights/insight-voice-prompt-blocks";

export class InsightGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InsightGenerationResponseError";
  }
}

const PURSUIT_INSIGHT_RULES = [
  "You generate a short personal insight for a single pursuit on the user's life map.",
  "",
  "You receive:",
  "- The target pursuit (title, status, milestones, theme)",
  "- ALL other pursuits on the map (titles, statuses, themes)",
  "- User context (name, age, location — may be partial)",
  "",
  "RULES — every rule is mandatory, not aspirational:",
  "",
  "1. HEADLINE: One sentence, under 100 characters. This is a VERDICT — what's smart, what's risky, what's notable about this pursuit given everything else on the map. Not a description.",
  '   Good: "Your qualifications are running ahead of the job search — that\'s leverage."',
  '   Good: "£500k ISA at 29 is top-decile ambition — the question is contribution rate."',
  '   Good: "Training for a half marathon while juggling a career switch takes real scheduling."',
  '   Bad: "This is an exciting goal that reflects your aspirations!"',
  '   Bad: "Jeremy, pursuing a Porsche 981 is an exciting goal!"',
  '   Bad: "This half marathon goal is a testament to your endurance."',
  "",
  "HEADLINE MUST ADD MEANING:",
  '- Never restate the status line ("X is paused with a deadline of Y") or the milestone count ("X has N milestones complete")',
  "- The user already sees those. The headline tells them what it MEANS.",
  '- Wrong: "Half-marathon pursuit has one milestone complete, 5k achieved 79 days ago"',
  '- Right: "5k is done — the jump to 10k is where the training plan actually starts"',
  "- If there's nothing meaningful to add beyond the status, write a shorter, honest headline rather than padding with facts the user already has.",
  "",
  "2. BODY: 2-4 sentences, under 500 characters total. Single prose paragraph — no headers, no labels, no bullet points. Must satisfy AT LEAST TWO of these three:",
  "   a) NAME another pursuit on the map and explain how it connects, conflicts with, or supports this one",
  "   b) STATE a concrete benchmark — a number, percentage, typical timeline, salary range, or cost estimate grounded in real-world knowledge for someone of this age/location. If you cannot provide a concrete benchmark, skip this — do NOT write vague sentences like \"many people your age are working towards similar goals\"",
  "   c) NAME a tension between two real map facts, or a cross-pursuit conflict the user may not have linked — do not predict consequences or future outcomes",
  "",
  "3. NEVER DO ANY OF THESE:",
  "   - Restate the pursuit title in full — use a short reference (\"the ISA\", \"this role\", \"the marathon\")",
  "   - Use the user's name more than once across headline + body combined",
  "   - Write a sentence that could apply to ANY pursuit if you swapped the title (\"this is an ambitious goal that demonstrates commitment\")",
  "   - Repeat the same idea in different words — if you've said it, move on",
  "   - Use \"exciting\", \"ambitious\", \"significant\", \"forward-thinking\", \"proactive\", \"demonstrates dedication\" — these are filler words that carry zero information",
  "   - Fill space when you have nothing useful to say — a 2-sentence insight that says something real is better than 4 sentences of padding",
  "",
  "4. PURSUIT TONE: Assigned server-side on the reflect path — do not set tone in JSON output.",
  "   Voice constraints arrive in <pursuit_tone_guidance> on reflect/enrich calls.",
  "   Legacy generate-insights pursuit TONE TAG rules (celebratory/nudge/reality_check) do not apply to reflect.",
  "",
  "5. CROSS-MAP AWARENESS: You can see every pursuit on the map. USE THIS. The most valuable thing you can do is connect pursuits the user might not have linked themselves. If a finance pursuit and a career pursuit are clearly related, say so. If two pursuits compete for the same time/resources, flag it.",
  "",
  "REMEMBER: The user can already see their own pursuit title and status. They gain ZERO value from you restating it. Every sentence must add information or reasoning they couldn't get from looking at their map.",
  "",
  "VOICE ANTI-PATTERNS (pursuit headline/body and global greeting — never use):",
  "- Do not open with the user's name (\"Alex, ...\").",
  "- Do not say \"your map shows\", \"the app sees\", \"this Reading reflects\".",
  "- Do not embed UI section labels (\"From your map:\", \"Comparison:\") in pursuit body — write plain prose only.",
  "- Do not use \"significant\" as filler — name what is actually notable.",
  "- Do not write \"You have been making progress\" — state what the progress is.",
  "- Never generic headlines like \"[title] is progressing well\".",
  "",
  TENSION_NOT_FORECAST_RULE,
  "",
  VOICE_EVALUATIVE_ANTI_PATTERNS,
].join("\n");

const PURSUIT_INSIGHT_SYSTEM_PROMPT = [
  PURSUIT_INSIGHT_RULES,
  "",
  "GROUND TRUTH:",
  "- Return ONLY valid JSON matching the requested schema.",
  "- Only use pursuits, themes, milestones, enrichAnswers, descriptions, and profile fields in context. Never invent facts, pursuits, or progress.",
  "- Pursuits may include currentAmount, targetAmount, unit, deadline — prefer these structured fields over re-parsing description when benchmarking finance or measurable goals.",
  "- Some pursuits include parentPursuitTitle — that pursuit grew from the named parent; the parent link is relevant context.",
  "- If the map is sparse, say so honestly — do not invent pursuits or imply activity that is not in context.",
  "- Follow the grounding rules in this prompt: every sentence must be specific to this person's actual map data.",
].join("\n");

const SYSTEM_PROMPT = [
  "You generate personal life-map insights for Pathfinder.",
  "Follow the grounding rules in this prompt: every sentence must be specific to this person's actual map data — real pursuit names, real numbers, real gaps. If a sentence could appear in someone else's app, rewrite it.",
  "Return ONLY valid JSON matching the requested schema.",
  "Be concise: quality over quantity. Total response must fit in 3000 output tokens.",
  "",
  "GROUND TRUTH:",
  "- Only use pursuits, categories, themes, milestones, enrichAnswers, descriptions, and profile fields in context. Never invent facts, pursuits, or progress.",
  "- Pursuits may include description (living context), enrichAnswers (structured quick-question answers), currentAmount, targetAmount, unit, deadline — prefer these structured fields over re-parsing title when benchmarking finance or measurable goals.",
  "- If the map is sparse, say so honestly — do not invent pursuits or imply activity that is not in context.",
  "- Some pursuits include parentPursuitTitle — that pursuit grew from the named parent; when generating insight for a nested pursuit, the parent link is relevant context.",
  "",
  "Surfaces:",
  "- global: whole-map compass in insight cache (greeting + 2–3 short sections + optional streamCta). Story is the live whole-map reading on mobile — global still generated for cache parity. No checklists, no tasks, no obligation.",
  "- themes: one entry per theme id in the map context (finance, work, becoming, people, health).",
  "- categories: one entry per category id in the map context.",
  "- pursuits: one entry per pursuit id in the map context — use the pursuit schema below (NOT the theme/category schema).",
  "",
  "Theme and category entries have: oneLiner, reflective, contextual, combined, tone (encouraging|nudge|celebratory).",
  "Mobile UI maps theme/category fields to: Headline (oneLiner), FROM YOUR MAP (reflective), COMPARISON (contextual), WHAT THIS OPENS (combined).",
  "",
  "NON-DUPLICATION RULE (theme/category prose fields):",
  "- Theme/category copy is macro synthesis — balance, bottlenecks, resource friction across pursuits in the theme.",
  "- Do not restate pursuit titles as inventory or repeat pursuit-panel execution narrative.",
  "- Each field must add information the user could not derive by looking at their own map.",
  "- Do not repeat the same idea across oneLiner, reflective, contextual, and combined.",
  "- 2–4 sentences per field. Density over length.",
  "- Forbid hedging: never \"it seems like\", \"you might want to\", \"perhaps\", \"could be worth\".",
  "- Forbid forecasting: never \"might mean\", \"could\", \"potentially\", \"this puts you at risk of\", or any clause describing a future outcome or its effect on the user — see TENSION NOT FORECAST below.",
  "- Forbid form-validation copy: never \"add a description to clarify\" or similar UI suggestions.",
  "- No motivational poster language: never \"you've got this\", \"keep pushing\", \"amazing progress\", \"celebrate\", \"milestone unlocked\".",
  "",
  TENSION_NOT_FORECAST_RULE,
  "",
  "oneLiner (theme/category headline — macro verdict):",
  "- Judgment on this theme as a system: where attention clusters, what is stalled, what is over-weighted.",
  "- May name one or two pursuits as examples — not a pursuit-by-pursuit list.",
  "",
  "reflective (FROM YOUR MAP — cross-pursuit dynamics in theme):",
  "- How pursuits in this theme compete for time, reinforce each other, or create tension.",
  "- Must name at least two specific pursuits when data supports it.",
  "- When map context includes confirmedRelationships touching this theme, cite at least one user-confirmed link by pursuit titles and label — never invent relationships.",
  "- Never category labels like \"your finance pursuits\" when specific titles exist in context.",
  "",
  "contextual (COMPARISON — external benchmarks for the theme):",
  "- Real benchmark information from general knowledge — typical salary ranges, how long this usually takes, what share of people at this age/location reach this milestone.",
  "- Use the user's name, age, and location from User context inside the benchmark logic — not as a prefix decoration.",
  "- Concrete approximate numbers when defensible (roughly £45–55k, typically 2–3 years, fewer than half of…). Omit if unsure.",
  '- Bad: "For a 29-year-old in London, pursuing DipPFS is valued in a competitive market." — prefix + generic filler, no new fact.',
  '- Bad: "This pursuit is important for your career." — inferable from the title alone.',
  "- If age OR location is unknown, set contextual to an empty string — do not guess or use \"someone your age\".",
  "",
  "combined (WHAT THIS OPENS — cross-pursuit synthesis for the theme):",
  "- Name tensions or reinforcements between pursuits in this theme — facts on the map, not predicted outcomes.",
  "- Not a repeat of the verdict (oneLiner) or external benchmark (contextual).",
  "- At most one tension or reinforcement — not a list.",
  "",
  "tone field (theme/category):",
  "- Default to encouraging. Use nudge only when map data shows a clear stall.",
  "- For PAUSED pursuits, prefer encouraging — acknowledge the pause; do not nudge to resume.",
  "- Use celebratory only for COMPLETE pursuits — name the achievement plainly without hype; never for active or stalled pursuits.",
  "",
  "--- Pursuit entries (schema: tone, headline, body) ---",
  PURSUIT_INSIGHT_RULES,
  "",
  pursuitStatusPromptBlock(),
  "",
  "global (whole-map cache):",
  "- greeting must name at least one real pursuit by title immediately — not a generic observation.",
  "- Each section body (MOMENTUM, ATTENTION, INTERESTING, etc.) must name specific pursuits — never theme-level summaries.",
  "- Section bodies must lead with the specific pursuit name, not a category framing. The pursuit name is the subject of the sentence, not a supporting example.",
  '- Bad: "Many pursuits, like Build £500k ISA and Clear credit card debt, lack recent progress signals"',
  '- Good: "Build £500k ISA and Clear £10,000 credit card debt have been active for weeks with no milestones completed — that means intentions without traction"',
  "- At most ONE concrete suggestion across the entire global block (greeting + all sections + streamCta combined).",
  "- Forbid generic observations like \"several pursuits lack progress\" or \"many pursuits, like…\" — name which pursuits and why that matters.",
  "- streamCta: optional warm invitation to capture progress — not a task list. Do not use bare \"Stream\" as a destination label.",
  "",
  "Length limits:",
  "- Theme/category fields (oneLiner, reflective, contextual, combined): 2–4 sentences max.",
  "- Pursuit headline: under 100 characters. Pursuit body: under 500 characters, single paragraph.",
  "- Global: 4 sentences maximum across greeting, sections, and streamCta.",
  "- Use compact strings. No paragraphs in theme/category fields. No markdown.",
  "",
  "Voice: direct, informed advisor — calm and map-native. Not a hype coach. Never shame or pressure.",
  "If the map is sparse, say so honestly and invite capture rather than inventing pursuits.",
].join("\n");

export const INSIGHT_GENERATION_SYSTEM_PROMPT = SYSTEM_PROMPT;

function buildUserMessage(mapJson: string, userContext: string): string {
  const themeIds = LIFE_AREA_IDS.join(", ");
  return [
    userContext || "(No profile context yet.)",
    "",
    "Life map JSON:",
    mapJson,
    "",
    `Include theme keys only for ids present in the map (${themeIds}).`,
    "Include every category id and every pursuit id from the map in categories and pursuits objects.",
    "Pursuit entries use { tone, headline, body } — not the theme/category four-field schema.",
    "global.sections: use short ALL-CAPS titles like MOMENTUM, ATTENTION, INTERESTING.",
    "Keep every string short enough that the whole JSON response stays under 3000 output tokens.",
  ].join("\n");
}

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

function collectMapNodeIds(mapContext: FormattedMapContext): {
  themeIds: string[];
  categoryIds: string[];
  pursuitIds: string[];
} {
  const themeIds: string[] = [];
  const categoryIds: string[] = [];
  const pursuitIds: string[] = [];
  for (const theme of mapContext.themes) {
    themeIds.push(theme.id);
    for (const category of theme.categories) {
      categoryIds.push(category.id);
      for (const pursuit of category.pursuits) {
        pursuitIds.push(pursuit.id);
      }
    }
  }
  return { themeIds, categoryIds, pursuitIds };
}

function filterMapContextForMissingNodes(
  mapContext: FormattedMapContext,
  missingThemeIds: Set<string>,
  missingCategoryIds: Set<string>,
  missingPursuitIds: Set<string>,
): FormattedMapContext {
  const themes = mapContext.themes
    .map((theme) => ({
      ...theme,
      categories: theme.categories
        .map((category) => ({
          ...category,
          pursuits: category.pursuits.filter((pursuit) => missingPursuitIds.has(pursuit.id)),
        }))
        .filter(
          (category) =>
            missingCategoryIds.has(category.id) ||
            category.pursuits.length > 0,
        ),
    }))
    .filter(
      (theme) =>
        missingThemeIds.has(theme.id) ||
        theme.categories.length > 0,
    );
  return { themes };
}

const themeCategoryNodeInsightSchema = z
  .object({
    themes: z.record(z.string(), insightLevelSchema).optional(),
    categories: z.record(z.string(), insightLevelSchema).optional(),
    /** @deprecated AI may still emit `hubs` — coerced to categories on parse. */
    hubs: z.record(z.string(), insightLevelSchema).optional(),
  })
  .transform((data) => ({
    themes: data.themes,
    categories: { ...(data.hubs ?? {}), ...(data.categories ?? {}) },
  }));

const pursuitNodeInsightSchema = z.object({
  pursuits: z.record(z.string(), pursuitInsightSchema).optional(),
});

const BACKFILL_SYSTEM_PROMPT = [
  "You generate missing theme/category insights for Pathfinder.",
  "Follow the grounding rules in generate-insights.ts and the main insight generator.",
  "Return ONLY valid JSON: { themes?, categories? } — each a record of id -> insight object.",
  "Include ONLY the ids listed in the user message — no extra keys.",
  "Each insight object has: oneLiner, reflective, contextual, combined, tone (encouraging|nudge|celebratory).",
  "Field jobs: oneLiner = theme macro verdict; reflective = cross-pursuit dynamics in theme; contextual = external benchmarks (COMPARISON); combined = forward-looking (WHAT THIS OPENS).",
  "Each field must pass the non-duplication rule: nothing inferable from the pursuit title alone.",
  "If age OR location is unknown, set contextual to an empty string.",
].join("\n");

const PURSUIT_BACKFILL_SYSTEM_PROMPT = [
  PURSUIT_INSIGHT_SYSTEM_PROMPT,
  "",
  "Return ONLY valid JSON: { pursuits?: Record<pursuitId, { tone, headline, body }> }.",
  "Include ONLY the pursuit ids listed in the user message — no extra keys.",
  "The life map JSON includes ALL pursuits — use them for cross-map connections even though you only output insights for the listed ids.",
].join("\n");

export type GenerateNodeInsightsRequest = {
  pursuitIds?: string[];
  themeIds?: string[];
  categoryIds?: string[];
};

function emptyNodeInsightPatch(): Pick<InsightGenerationResult, "themes" | "categories" | "pursuits"> {
  return { themes: {}, categories: {}, pursuits: {} };
}

async function generateThemeCategoryNodeInsights(
  userId: string,
  mapContext: FormattedMapContext,
  userContext: string,
  themeIds: Set<string>,
  categoryIds: Set<string>,
): Promise<Pick<InsightGenerationResult, "themes" | "categories">> {
  if (themeIds.size === 0 && categoryIds.size === 0) {
    return { themes: {}, categories: {} };
  }

  const slimContext = filterMapContextForMissingNodes(
    mapContext,
    themeIds,
    categoryIds,
    new Set(),
  );

  const raw = await generateJsonCompletion({
    system: BACKFILL_SYSTEM_PROMPT,
    user: [
      userContext || "(No profile context yet.)",
      "",
      "Missing insight ids:",
      `themes: ${[...themeIds].join(", ") || "(none)"}`,
      `categories: ${[...categoryIds].join(", ") || "(none)"}`,
      "",
      "Relevant map JSON:",
      JSON.stringify(slimContext, null, 2),
    ].join("\n"),
    maxTokens: 2048,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    console.error("[insights] theme/category insight generation returned invalid JSON", { err, raw });
    throw new InsightGenerationResponseError(
      "Insight generation returned incomplete JSON. Please try refreshing again.",
      { cause: err },
    );
  }

  const parsed = themeCategoryNodeInsightSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[insights] theme/category insight generation returned invalid shape", {
      issues: parsed.error.issues,
      raw,
    });
    throw new InsightGenerationResponseError(
      `Insight generation returned an invalid response shape: ${
        parsed.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  return {
    themes: await gateThemeInsightsPatch(userId, parsed.data.themes ?? {}),
    categories: parsed.data.categories ?? {},
  };
}

async function generatePursuitNodeInsights(
  userId: string,
  mapContext: FormattedMapContext,
  userContext: string,
  pursuitIds: Set<string>,
): Promise<Pick<InsightGenerationResult, "pursuits">> {
  if (pursuitIds.size === 0) {
    return { pursuits: {} };
  }

  const raw = await generateJsonCompletion({
    system: PURSUIT_BACKFILL_SYSTEM_PROMPT,
    user: [
      userContext || "(No profile context yet.)",
      "",
      "Generate insights for these pursuit ids:",
      [...pursuitIds].join(", "),
      "",
      "Full life map JSON (all pursuits — use for cross-map connections):",
      JSON.stringify(mapContext, null, 2),
    ].join("\n"),
    maxTokens: 2048,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    console.error("[insights] pursuit insight generation returned invalid JSON", { err, raw });
    throw new InsightGenerationResponseError(
      "Insight generation returned incomplete JSON. Please try refreshing again.",
      { cause: err },
    );
  }

  const parsed = pursuitNodeInsightSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[insights] pursuit insight generation returned invalid shape", {
      issues: parsed.error.issues,
      raw,
    });
    throw new InsightGenerationResponseError(
      `Insight generation returned an invalid response shape: ${
        parsed.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  return { pursuits: parsed.data.pursuits ?? {} };
}

/** Focused node-level generation — one or more pursuits/themes/categories without a full-map pass. */
export async function generateNodeInsights(
  userId: string,
  request: GenerateNodeInsightsRequest,
): Promise<Pick<InsightGenerationResult, "themes" | "categories" | "pursuits">> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId),
    formatUserContext(userId),
  ]);

  const themeIds = new Set(request.themeIds ?? []);
  const categoryIds = new Set(request.categoryIds ?? []);
  const pursuitIds = new Set(request.pursuitIds ?? []);
  if (themeIds.size === 0 && categoryIds.size === 0 && pursuitIds.size === 0) {
    return emptyNodeInsightPatch();
  }

  const themeCategoryPatch = await generateThemeCategoryNodeInsights(
    userId,
    mapContext,
    userContext,
    themeIds,
    categoryIds,
  );
  const pursuitPatch = await generatePursuitNodeInsights(
    userId,
    mapContext,
    userContext,
    pursuitIds,
  );

  return {
    themes: themeCategoryPatch.themes,
    categories: themeCategoryPatch.categories,
    pursuits: pursuitPatch.pursuits,
  };
}

export async function finalizeInsightGeneration(
  userId: string,
  mapContext: FormattedMapContext,
  userContext: string,
  generated: InsightGenerationResult,
): Promise<InsightGenerationResult> {
  return backfillMissingNodeInsights(userId, mapContext, userContext, generated);
}

export function buildInsightUserMessage(mapJson: string, userContext: string): string {
  return buildUserMessage(mapJson, userContext);
}

async function backfillMissingNodeInsights(
  userId: string,
  mapContext: FormattedMapContext,
  _userContext: string,
  generated: InsightGenerationResult,
): Promise<InsightGenerationResult> {
  const { themeIds, categoryIds, pursuitIds } = collectMapNodeIds(mapContext);
  const missingThemeIds = new Set(themeIds.filter((id) => !generated.themes[id]));
  const missingCategoryIds = new Set(categoryIds.filter((id) => !generated.categories[id]));
  const missingPursuitIds = new Set(pursuitIds.filter((id) => !generated.pursuits[id]));

  if (
    missingThemeIds.size === 0 &&
    missingCategoryIds.size === 0 &&
    missingPursuitIds.size === 0
  ) {
    return generated;
  }

  console.warn("[insights] backfilling missing node insights", {
    themes: missingThemeIds.size,
    categories: missingCategoryIds.size,
    pursuits: missingPursuitIds.size,
  });

  let patch: Pick<InsightGenerationResult, "themes" | "categories" | "pursuits">;
  try {
    patch = await generateNodeInsights(userId, {
      themeIds: [...missingThemeIds],
      categoryIds: [...missingCategoryIds],
      pursuitIds: [...missingPursuitIds],
    });
  } catch (err) {
    console.error("[insights] backfill failed", err);
    return generated;
  }

  const mergeLevel = <T extends Record<string, unknown>>(
    base: Record<string, T>,
    patchLevel: Record<string, T> | undefined,
  ) => ({ ...base, ...patchLevel });

  return {
    global: generated.global,
    themes: mergeLevel(generated.themes, patch.themes),
    categories: mergeLevel(generated.categories, patch.categories),
    pursuits: mergeLevel(generated.pursuits, patch.pursuits),
  };
}

export async function generateInsights(userId: string): Promise<InsightGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId),
    formatUserContext(userId),
  ]);

  const raw = await generateJsonCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserMessage(JSON.stringify(mapContext, null, 2), userContext),
    maxTokens: 4096,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    console.error("[insights] Gemini returned invalid/truncated JSON", { raw });
    throw new InsightGenerationResponseError(
      "Insight generation returned incomplete JSON. Please try refreshing again.",
      { cause: err },
    );
  }

  const parsed = insightGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[insights] Gemini returned JSON with invalid insight shape", {
      issues: parsed.error.issues,
      raw,
    });
    throw new InsightGenerationResponseError(
      `Insight generation returned an invalid response shape: ${
        parsed.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  const gatedThemes = await gateThemeInsightsPatch(userId, parsed.data.themes);
  return backfillMissingNodeInsights(userId, mapContext, userContext, {
    ...parsed.data,
    themes: gatedThemes,
  });
}
