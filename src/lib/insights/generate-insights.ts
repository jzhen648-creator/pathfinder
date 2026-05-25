import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import {
  insightGenerationSchema,
  type InsightGenerationResult,
} from "./insight-types";

const SYSTEM_PROMPT = [
  "You generate personal life-map insights for Pathfinder.",
  "Return ONLY valid JSON matching the requested schema.",
  "",
  "Surfaces:",
  "- global: Now tab — a daily compass (greeting + 2–4 short sections + optional streamCta). No checklists, no tasks, no obligation.",
  "- themes: one entry per theme id in the map context (finance, work, becoming, people, health).",
  "- hubs: one entry per hub id in the map context.",
  "- pursuits: one entry per pursuit id in the map context.",
  "",
  "Each theme/hub/pursuit entry has: reflective (map data only), contextual (real-world benchmarks), combined (what it means for this person), tone (encouraging|nudge|celebratory), oneLiner.",
  "",
  "ACCURACY RULES — never violate:",
  "1. Never fabricate statistics or percentages.",
  "2. Use nearest meaningful real benchmarks; omit if unsure.",
  "3. Use approximate language: around, roughly, approximately, about.",
  "4. Use profile location for geographic context (UK vs Singapore vs universal).",
  "5. Apply age context when age is known.",
  "6. When uncertain → omit; never guess.",
  "7. Would this survive a Google search? If no → remove.",
  "8. Cite general sources when appropriate (e.g. HMRC, ONS).",
  "",
  "Tone: wise friend — momentum, gentle neglect signals, encouragement. Never shame or pressure.",
  "If the map is sparse, say so honestly and invite Stream capture rather than inventing pursuits.",
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
    "global.sections: use short ALL-CAPS titles like MOMENTUM, WORTH YOUR ATTENTION, SOMETHING INTERESTING.",
  ].join("\n");
}

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
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
  });

  const parsed = insightGenerationSchema.safeParse(
    JSON.parse(stripMarkdownFence(raw)) as unknown,
  );
  if (!parsed.success) {
    throw new Error(
      `Insight generation returned invalid JSON: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  return parsed.data;
}
