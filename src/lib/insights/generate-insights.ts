import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
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
  "2. BODY: 2-4 sentences, under 500 characters total. Single prose paragraph — no headers, no labels, no bullet points. Must satisfy AT LEAST TWO of these three:",
  "   a) NAME another pursuit on the map and explain how it connects, conflicts with, or supports this one",
  "   b) STATE a concrete benchmark — a number, percentage, typical timeline, salary range, or cost estimate grounded in real-world knowledge for someone of this age/location. If you cannot provide a concrete benchmark, skip this — do NOT write vague sentences like \"many people your age are working towards similar goals\"",
  "   c) IDENTIFY one specific next step, risk, or opportunity that the user likely hasn't considered",
  "",
  "3. NEVER DO ANY OF THESE:",
  "   - Restate the pursuit title in full — use a short reference (\"the ISA\", \"this role\", \"the marathon\")",
  "   - Use the user's name more than once across headline + body combined",
  "   - Write a sentence that could apply to ANY pursuit if you swapped the title (\"this is an ambitious goal that demonstrates commitment\")",
  "   - Repeat the same idea in different words — if you've said it, move on",
  "   - Use \"exciting\", \"ambitious\", \"significant\", \"forward-thinking\", \"proactive\", \"demonstrates dedication\" — these are filler words that carry zero information",
  "   - Fill space when you have nothing useful to say — a 2-sentence insight that says something real is better than 4 sentences of padding",
  "",
  "4. TONE TAG: Choose the tone that matches reality, not positivity bias.",
  "   - \"celebratory\" — only if real progress has been made (milestones completed, status COMPLETE)",
  "   - \"encouraging\" — active pursuit with visible momentum",
  "   - \"nudge\" — active pursuit with stalled milestones or no recent progress",
  "   - \"reality_check\" — pursuit that conflicts with other map evidence or has structural issues",
  "   - \"informational\" — factual benchmark or context, no emotional framing needed",
  "",
  "5. CROSS-MAP AWARENESS: You can see every pursuit on the map. USE THIS. The most valuable thing you can do is connect pursuits the user might not have linked themselves. If a finance pursuit and a career pursuit are clearly related, say so. If two pursuits compete for the same time/resources, flag it.",
  "",
  "REMEMBER: The user can already see their own pursuit title and status. They gain ZERO value from you restating it. Every sentence must add information or reasoning they couldn't get from looking at their map.",
].join("\n");

const PURSUIT_INSIGHT_SYSTEM_PROMPT = [
  PURSUIT_INSIGHT_RULES,
  "",
  "GROUND TRUTH:",
  "- Return ONLY valid JSON matching the requested schema.",
  "- Only use pursuits, themes, marks, milestones, and profile fields in context. Never invent facts, pursuits, or progress.",
  "- Pursuits may include currentAmount, targetAmount, unit, deadline — prefer these structured fields over re-parsing description when benchmarking finance or measurable goals.",
  "- Some pursuits include parentPursuitTitle — that pursuit grew from the named parent; the parent link is relevant context.",
  "- If the map is sparse, say so honestly — do not invent pursuits or imply activity that is not in context.",
  "- Follow pathfinder/PROMPTS.md: every sentence must be specific to this person's actual map data.",
].join("\n");

const SYSTEM_PROMPT = [
  "You generate personal life-map insights for Pathfinder.",
  "Follow pathfinder/PROMPTS.md: every sentence must be specific to this person's actual map data — real pursuit names, real numbers, real gaps. If a sentence could appear in someone else's app, rewrite it.",
  "Return ONLY valid JSON matching the requested schema.",
  "Be concise: quality over quantity. Total response must fit in 3000 output tokens.",
  "",
  "GROUND TRUTH:",
  "- Only use pursuits, hubs, themes, marks, milestones, and profile fields in context. Never invent facts, pursuits, or progress.",
  "- Marks are life facts and events that enrich each theme — people, skills, events, standing truths. Each theme includes a marks array.",
  "- Pursuits may include currentAmount, targetAmount, unit, deadline — prefer these structured fields over re-parsing description when benchmarking finance or measurable goals.",
  "- At node scope, only reference marks from other themes when they have a direct, specific connection to the theme, hub, or pursuit you are discussing. Do not force cross-references.",
  "- If the map is sparse, say so honestly — do not invent pursuits or imply activity that is not in context.",
  "- Some pursuits include parentPursuitTitle — that pursuit grew from the named parent; when generating insight for a nested pursuit, the parent link is relevant context.",
  "",
  "Surfaces:",
  "- global: whole-map compass in insight cache (greeting + 2–3 short sections + optional streamCta). Story is the live whole-map reading on mobile — global still generated for cache parity. No checklists, no tasks, no obligation.",
  "- themes: one entry per theme id in the map context (finance, work, becoming, people, health).",
  "- hubs: one entry per hub id in the map context.",
  "- pursuits: one entry per pursuit id in the map context — use the pursuit schema below (NOT the theme/hub schema).",
  "",
  "Theme and hub entries have: oneLiner, reflective, contextual, combined, tone (encouraging|nudge|celebratory).",
  "Mobile UI maps theme/hub fields to: Headline (oneLiner), FROM YOUR MAP (reflective), COMPARISON (contextual), WHAT THIS OPENS (combined).",
  "",
  "NON-DUPLICATION RULE (theme/hub prose fields):",
  "- If the content could be inferred from the pursuit title alone, cut or replace it.",
  "- Do not restate the pursuit title or describe what the user already sees on screen.",
  "- Each field must add information the user could not derive by looking at their own map.",
  "- Do not repeat the same idea across oneLiner, reflective, contextual, and combined.",
  "- 2–4 sentences per field. Density over length.",
  "- Forbid hedging: never \"it seems like\", \"you might want to\", \"perhaps\", \"could be worth\".",
  "- Forbid form-validation copy: never \"add a description to clarify\" or similar UI suggestions.",
  "- No motivational poster language: never \"you've got this\", \"keep pushing\", \"amazing progress\", \"celebrate\", \"milestone unlocked\".",
  "",
  "oneLiner (headline — verdict):",
  "- A genuine judgment on this pursuit — is it well-sequenced? Fast or slow for the user's age? Smart given what else is on their map?",
  "- Not a description. Not a restatement of the title. A direct, informed advisor take.",
  "- May name the pursuit once if needed for clarity — not as the whole sentence.",
  "",
  "reflective (FROM YOUR MAP — cross-map reasoning):",
  "- How does this pursuit connect to, build on, or create tension with other pursuits or marks in context?",
  "- Must name at least one other pursuit or mark explicitly and state the relationship (builds on, ahead of, tension with, leverage).",
  "- Never category labels like \"your finance pursuits\" when specific titles exist in context.",
  '- Good: "You have CEMAP done, DipPFS in progress, and a mortgage broker role as a target — the qualifications are ahead of the role, which is good leverage."',
  '- Bad: restating only the focal pursuit with no cross-map link.',
  "",
  "contextual (COMPARISON — external benchmarks):",
  "- Real benchmark information from general knowledge — typical salary ranges, how long this usually takes, what share of people at this age/location reach this milestone.",
  "- Use the user's name, age, and location from User context inside the benchmark logic — not as a prefix decoration.",
  "- Concrete approximate numbers when defensible (roughly £45–55k, typically 2–3 years, fewer than half of…). Omit if unsure.",
  '- Bad: "For a 29-year-old in London, pursuing DipPFS is valued in a competitive market." — prefix + generic filler, no new fact.',
  '- Bad: "This pursuit is important for your career." — inferable from the title alone.',
  "- If age OR location is unknown, set contextual to an empty string — do not guess or use \"someone your age\".",
  "",
  "combined (WHAT THIS OPENS — forward-looking):",
  "- One forward-looking block: job titles, certifications, or income thresholds that become accessible after this pursuit; logical next pursuit on the map.",
  "- Not a repeat of the verdict (oneLiner) or external benchmark (contextual).",
  "- At most one concrete next step or unlock — not a list.",
  "",
  "tone field (theme/hub):",
  "- Default to encouraging. Use nudge only when map data shows a clear stall.",
  "- For PAUSED pursuits, prefer encouraging — acknowledge the pause; do not nudge to resume.",
  "- Use celebratory only for COMPLETE pursuits — name the achievement plainly without hype; never for active or stalled pursuits.",
  "",
  "--- Pursuit entries (schema: tone, headline, body) ---",
  PURSUIT_INSIGHT_RULES,
  "",
  "Pursuit status (status field in map context):",
  "- COMPLETE — acknowledge as a real achievement. Explain what completing this specific pursuit says about the person. Never treat completed pursuits as gaps, nudges, or suggestions.",
  "- ACTIVE — assess momentum from theme marks and milestone progress.",
  "- PAUSED — the pursuit is deliberately paused. Reflect why the pause may be intentional or what is waiting — warm, no pressure to resume. Do not treat as a gap, failure, or nudge to unpause.",
  "",
  "global (whole-map cache):",
  "- greeting must name at least one real pursuit by title immediately — not a generic observation.",
  "- Each section body (MOMENTUM, ATTENTION, INTERESTING, etc.) must name specific pursuits — never theme-level summaries.",
  "- Section bodies must lead with the specific pursuit name, not a category framing. The pursuit name is the subject of the sentence, not a supporting example.",
  '- Bad: "Many pursuits, like Build £500k ISA and Clear credit card debt, lack recent marks"',
  '- Good: "Build £500k ISA and Clear £10,000 credit card debt have been active for weeks without a single mark — that means intentions without traction"',
  "- At most ONE concrete suggestion across the entire global block (greeting + all sections + streamCta combined).",
  "- Forbid generic observations like \"several pursuits lack recent marks\" or \"many pursuits, like…\" — name which pursuits and why that matters.",
  "- streamCta: optional warm invitation to capture progress — not a task list. Do not use bare \"Stream\" as a destination label.",
  "",
  "Length limits:",
  "- Theme/hub fields (oneLiner, reflective, contextual, combined): 2–4 sentences max.",
  "- Pursuit headline: under 100 characters. Pursuit body: under 500 characters, single paragraph.",
  "- Global: 4 sentences maximum across greeting, sections, and streamCta.",
  "- Use compact strings. No paragraphs in theme/hub fields. No markdown.",
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
    "Include every hub id and every pursuit id from the map in hubs and pursuits objects.",
    "Pursuit entries use { tone, headline, body } — not the theme/hub four-field schema.",
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
  hubIds: string[];
  pursuitIds: string[];
} {
  const themeIds: string[] = [];
  const hubIds: string[] = [];
  const pursuitIds: string[] = [];
  for (const theme of mapContext.themes) {
    themeIds.push(theme.id);
    for (const hub of theme.hubs) {
      hubIds.push(hub.id);
      for (const pursuit of hub.pursuits) {
        pursuitIds.push(pursuit.id);
      }
    }
  }
  return { themeIds, hubIds, pursuitIds };
}

function filterMapContextForMissingNodes(
  mapContext: FormattedMapContext,
  missingThemeIds: Set<string>,
  missingHubIds: Set<string>,
  missingPursuitIds: Set<string>,
): FormattedMapContext {
  const themes = mapContext.themes
    .map((theme) => ({
      ...theme,
      hubs: theme.hubs
        .map((hub) => ({
          ...hub,
          pursuits: hub.pursuits.filter((pursuit) => missingPursuitIds.has(pursuit.id)),
        }))
        .filter(
          (hub) =>
            missingHubIds.has(hub.id) ||
            hub.pursuits.length > 0,
        ),
    }))
    .filter(
      (theme) =>
        missingThemeIds.has(theme.id) ||
        theme.hubs.length > 0,
    );
  return { themes };
}

const themeHubNodeInsightSchema = z.object({
  themes: z.record(z.string(), insightLevelSchema).optional(),
  hubs: z.record(z.string(), insightLevelSchema).optional(),
});

const pursuitNodeInsightSchema = z.object({
  pursuits: z.record(z.string(), pursuitInsightSchema).optional(),
});

const BACKFILL_SYSTEM_PROMPT = [
  "You generate missing theme/hub insights for Pathfinder.",
  "Follow pathfinder/PROMPTS.md and the main insight generator in generate-insights.ts.",
  "Return ONLY valid JSON: { themes?, hubs? } — each a record of id -> insight object.",
  "Include ONLY the ids listed in the user message — no extra keys.",
  "Each insight object has: oneLiner, reflective, contextual, combined, tone (encouraging|nudge|celebratory).",
  "Field jobs: oneLiner = verdict; reflective = cross-map (FROM YOUR MAP); contextual = external benchmarks (COMPARISON); combined = forward-looking (WHAT THIS OPENS).",
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
  hubIds?: string[];
};

function emptyNodeInsightPatch(): Pick<InsightGenerationResult, "themes" | "hubs" | "pursuits"> {
  return { themes: {}, hubs: {}, pursuits: {} };
}

async function generateThemeHubNodeInsights(
  userId: string,
  mapContext: FormattedMapContext,
  userContext: string,
  themeIds: Set<string>,
  hubIds: Set<string>,
): Promise<Pick<InsightGenerationResult, "themes" | "hubs">> {
  if (themeIds.size === 0 && hubIds.size === 0) {
    return { themes: {}, hubs: {} };
  }

  const slimContext = filterMapContextForMissingNodes(
    mapContext,
    themeIds,
    hubIds,
    new Set(),
  );

  const raw = await generateJsonCompletion({
    system: BACKFILL_SYSTEM_PROMPT,
    user: [
      userContext || "(No profile context yet.)",
      "",
      "Missing insight ids:",
      `themes: ${[...themeIds].join(", ") || "(none)"}`,
      `hubs: ${[...hubIds].join(", ") || "(none)"}`,
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
    console.error("[insights] theme/hub insight generation returned invalid JSON", { err, raw });
    throw new InsightGenerationResponseError(
      "Insight generation returned incomplete JSON. Please try refreshing again.",
      { cause: err },
    );
  }

  const parsed = themeHubNodeInsightSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[insights] theme/hub insight generation returned invalid shape", {
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
    themes: parsed.data.themes ?? {},
    hubs: parsed.data.hubs ?? {},
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

/** Focused node-level generation — one or more pursuits/themes/hubs without a full-map pass. */
export async function generateNodeInsights(
  userId: string,
  request: GenerateNodeInsightsRequest,
): Promise<Pick<InsightGenerationResult, "themes" | "hubs" | "pursuits">> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    formatUserContext(userId),
  ]);

  const themeIds = new Set(request.themeIds ?? []);
  const hubIds = new Set(request.hubIds ?? []);
  const pursuitIds = new Set(request.pursuitIds ?? []);
  if (themeIds.size === 0 && hubIds.size === 0 && pursuitIds.size === 0) {
    return emptyNodeInsightPatch();
  }

  const themeHubPatch = await generateThemeHubNodeInsights(
    userId,
    mapContext,
    userContext,
    themeIds,
    hubIds,
  );
  const pursuitPatch = await generatePursuitNodeInsights(
    userId,
    mapContext,
    userContext,
    pursuitIds,
  );

  return {
    themes: themeHubPatch.themes,
    hubs: themeHubPatch.hubs,
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
  const { themeIds, hubIds, pursuitIds } = collectMapNodeIds(mapContext);
  const missingThemeIds = new Set(themeIds.filter((id) => !generated.themes[id]));
  const missingHubIds = new Set(hubIds.filter((id) => !generated.hubs[id]));
  const missingPursuitIds = new Set(pursuitIds.filter((id) => !generated.pursuits[id]));

  if (
    missingThemeIds.size === 0 &&
    missingHubIds.size === 0 &&
    missingPursuitIds.size === 0
  ) {
    return generated;
  }

  console.warn("[insights] backfilling missing node insights", {
    themes: missingThemeIds.size,
    hubs: missingHubIds.size,
    pursuits: missingPursuitIds.size,
  });

  let patch: Pick<InsightGenerationResult, "themes" | "hubs" | "pursuits">;
  try {
    patch = await generateNodeInsights(userId, {
      themeIds: [...missingThemeIds],
      hubIds: [...missingHubIds],
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
    hubs: mergeLevel(generated.hubs, patch.hubs),
    pursuits: mergeLevel(generated.pursuits, patch.pursuits),
  };
}

export async function generateInsights(userId: string): Promise<InsightGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
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

  return backfillMissingNodeInsights(userId, mapContext, userContext, parsed.data);
}
