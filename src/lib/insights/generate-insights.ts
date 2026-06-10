import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { z } from "zod";
import {
  insightGenerationSchema,
  insightLevelSchema,
  type InsightGenerationResult,
  type InsightLevelPayload,
} from "./insight-types";

export class InsightGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InsightGenerationResponseError";
  }
}

const SYSTEM_PROMPT = [
  "You generate personal life-map insights for Pathfinder.",
  "Follow pathfinder/PROMPTS.md: every sentence must be specific to this person's actual map data — real pursuit names, real numbers, real gaps. If a sentence could appear in someone else's app, rewrite it.",
  "Return ONLY valid JSON matching the requested schema.",
  "Be concise: quality over quantity. Total response must fit in 3000 output tokens.",
  "",
  "GROUND TRUTH:",
  "- Only use pursuits, hubs, themes, marks, milestones, and profile fields in context. Never invent facts, pursuits, or progress.",
  "- Marks are life facts and events that enrich each theme — people, skills, events, standing truths. Each theme includes a marks array.",
  "- At node scope, only reference marks from other themes when they have a direct, specific connection to the theme, hub, or pursuit you are discussing. Do not force cross-references.",
  "- If the map is sparse, say so honestly — do not invent pursuits or imply activity that is not in context.",
  "- Some pursuits include parentPursuitTitle — that pursuit grew from the named parent; when generating insight for a nested pursuit, the parent link is relevant context.",
  "",
  "Surfaces:",
  "- global: whole-map compass in insight cache (greeting + 2–3 short sections + optional streamCta). Story is the live whole-map reading on mobile — global still generated for cache parity. No checklists, no tasks, no obligation.",
  "- themes: one entry per theme id in the map context (finance, work, becoming, people, health).",
  "- hubs: one entry per hub id in the map context.",
  "- pursuits: one entry per pursuit id in the map context.",
  "",
  "Each theme/hub/pursuit entry has: reflective, contextual, combined, tone (encouraging|nudge|celebratory), oneLiner.",
  "",
  "reflective:",
  "- Must reference the actual pursuit, hub, or theme by name from map context — never category labels like \"your finance pursuits\" when specific titles exist.",
  "- Must answer why this matters for this person — not restate what exists on the map.",
  "- Connect to identity where possible, not only productivity.",
  "- Forbid hedging: never \"it seems like\", \"you might want to\", \"perhaps\", \"could be worth\".",
  "- Forbid form-validation copy: never \"add a description to clarify\" or similar UI suggestions.",
  "- Do not repeat the same pursuit name more than twice across reflective + combined + oneLiner for one entry.",
  "",
  "contextual:",
  "- Exactly ONE sentence — a peer comparison tied to this specific named pursuit, hub, or theme.",
  '- Template when age AND location are known: "For a [age]-year-old in [location], [specific observation about this named pursuit/hub/theme] puts you [ahead of / behind / in line with] most peers at your life stage."',
  "- Tie the comparison to a specific pursuit by name where possible, not theme-level hand-waving.",
  "- Use approximate language (around, roughly, about). Never fabricate statistics or percentages.",
  "- Draw on general knowledge of typical life patterns, financial norms, and career trajectories for the user's age and location.",
  "- Warm observation only — no hype framing (never \"crushing it\", \"ahead of the pack\", \"well on track\").",
  "- If age OR location is unknown, set contextual to an empty string — do not guess, placeholder, or use \"someone your age\".",
  "",
  "combined and oneLiner:",
  "- Must name the actual pursuit or hub from map context.",
  "- Must include why it matters — the so-what for this person.",
  "- At most ONE concrete suggestion across combined + oneLiner for this entry.",
  "- No motivational poster language: never \"you've got this\", \"keep pushing\", \"amazing progress\", \"celebrate\", \"milestone unlocked\".",
  "",
  "tone field:",
  "- Default to encouraging. Use nudge only when map data shows a clear stall.",
  "- For ON_HOLD pursuits, prefer encouraging — acknowledge the pause; do not nudge to resume.",
  "- Use celebratory only for COMPLETE pursuits — name the achievement plainly without hype; never for active or stalled pursuits.",
  "",
  "Pursuit status (status field in map context):",
  "- COMPLETE — acknowledge as a real achievement. Name the pursuit. Explain what completing this specific pursuit says about the person. Never treat completed pursuits as gaps, nudges, or suggestions.",
  "- ACTIVE — assess momentum from theme marks and milestone progress. Name the pursuit specifically.",
  "- ON_HOLD — the pursuit is deliberately paused. Name it. Reflect why the pause may be intentional or what is waiting — warm, no pressure to resume. Do not treat as a gap, failure, or nudge to unpause.",
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
  "- Each theme/hub/pursuit entry: reflective + combined together 2-3 sentences max (contextual is one sentence only).",
  "- Global: 4 sentences maximum across greeting, sections, and streamCta.",
  "- Use compact strings. No paragraphs. No markdown.",
  "",
  "Negative examples — never produce copy like the Bad lines:",
  '- Bad: "Your finance pursuits show ambition" → Good: "Build £500k Stocks and Shares ISA alongside Clear £10,000 credit card debt — building and clearing simultaneously at 29 is financially mature."',
  '- Bad: "Add a description to make this clearer" → form validation, never insight copy.',
  '- Bad: "Consider adding milestones to keep this moving" → too generic; name the pursuit and one specific next step instead.',
  '- Bad: treating a COMPLETE pursuit as still needing attention.',
  '- Bad: suggesting milestones for a COMPLETE pursuit.',
  "",
  "ACCURACY RULES — never violate:",
  "1. Never fabricate statistics or percentages.",
  "2. Use nearest meaningful real benchmarks; omit if unsure.",
  "3. Use approximate language: around, roughly, approximately, about.",
  "4. Use profile location for geographic context (UK vs Singapore vs universal).",
  "5. Apply age context when age is known.",
  "6. When uncertain → omit; never guess.",
  "7. Would this survive a Google search? If no → remove.",
  "",
  "Voice: calm, map-native. Warm but not flattery — same register as Story at node scope. Never shame or pressure. Never motivational poster copy.",
  "If the map is sparse, say so honestly and invite capture rather than inventing pursuits.",
].join("\n");

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

const nodeInsightGenerationSchema = z.object({
  themes: z.record(z.string(), insightLevelSchema).optional(),
  hubs: z.record(z.string(), insightLevelSchema).optional(),
  pursuits: z.record(z.string(), insightLevelSchema).optional(),
});

const BACKFILL_SYSTEM_PROMPT = [
  "You generate missing node-level insights for Pathfinder.",
  "Follow pathfinder/PROMPTS.md: every sentence must reference this person's actual map data.",
  "Return ONLY valid JSON: { themes?, hubs?, pursuits? } — each a record of id -> insight object.",
  "Include ONLY the ids listed in the user message — no extra keys.",
  "Each insight object has: reflective, contextual, combined, tone (encouraging|nudge|celebratory), oneLiner.",
  "Use the same voice and accuracy rules as the main insight generator.",
  "If age OR location is unknown, set contextual to an empty string.",
].join("\n");

export type GenerateNodeInsightsRequest = {
  pursuitIds?: string[];
  themeIds?: string[];
  hubIds?: string[];
};

function expandNodeScopeFromMap(
  mapContext: FormattedMapContext,
  request: GenerateNodeInsightsRequest,
): {
  themeIds: Set<string>;
  hubIds: Set<string>;
  pursuitIds: Set<string>;
} {
  const pursuitIds = new Set(request.pursuitIds ?? []);
  const themeIds = new Set(request.themeIds ?? []);
  const hubIds = new Set(request.hubIds ?? []);

  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      for (const pursuit of hub.pursuits) {
        if (pursuitIds.has(pursuit.id)) {
          themeIds.add(theme.id);
          hubIds.add(hub.id);
        }
      }
    }
  }

  return { themeIds, hubIds, pursuitIds };
}

function emptyNodeInsightPatch(): Pick<InsightGenerationResult, "themes" | "hubs" | "pursuits"> {
  return { themes: {}, hubs: {}, pursuits: {} };
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
    formatMapContext(userId),
    formatUserContext(userId),
  ]);

  const { themeIds, hubIds, pursuitIds } = expandNodeScopeFromMap(mapContext, request);
  if (themeIds.size === 0 && hubIds.size === 0 && pursuitIds.size === 0) {
    return emptyNodeInsightPatch();
  }

  const slimContext = filterMapContextForMissingNodes(
    mapContext,
    themeIds,
    hubIds,
    pursuitIds,
  );

  const raw = await generateJsonCompletion({
    system: BACKFILL_SYSTEM_PROMPT,
    user: [
      userContext || "(No profile context yet.)",
      "",
      "Missing insight ids:",
      `themes: ${[...themeIds].join(", ") || "(none)"}`,
      `hubs: ${[...hubIds].join(", ") || "(none)"}`,
      `pursuits: ${[...pursuitIds].join(", ") || "(none)"}`,
      "",
      "Relevant map JSON:",
      JSON.stringify(slimContext, null, 2),
    ].join("\n"),
    maxTokens: 2048,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw)) as unknown;
  } catch (err) {
    console.error("[insights] node insight generation returned invalid JSON", { err, raw });
    throw new InsightGenerationResponseError(
      "Insight generation returned incomplete JSON. Please try refreshing again.",
      { cause: err },
    );
  }

  const parsed = nodeInsightGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[insights] node insight generation returned invalid shape", {
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
    pursuits: parsed.data.pursuits ?? {},
  };
}

async function backfillMissingNodeInsights(
  userId: string,
  mapContext: FormattedMapContext,
  userContext: string,
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

  const mergeLevel = (
    base: Record<string, InsightLevelPayload>,
    patchLevel: Record<string, InsightLevelPayload> | undefined,
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
    formatMapContext(userId),
    formatUserContext(userId),
  ]);

  const raw = await generateJsonCompletion({
    system: SYSTEM_PROMPT,
    user: buildUserMessage(JSON.stringify(mapContext, null, 2), userContext),
    maxTokens: 4096,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw)) as unknown;
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
