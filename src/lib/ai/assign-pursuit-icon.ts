import { z } from "zod";
import { generateJsonCompletion } from "@/lib/gemini";
import { getLucideInstalledSlugs, isValidLucideSlug } from "@/lib/icons/enumerate-lucide-slugs";
import { matchPreferredOverrideIconSlug } from "@/lib/icons/match-pursuit-icon-override";

const assignResponseSchema = z.object({
  iconName: z.string().nullable().optional(),
});

const ASSIGN_SYSTEM_PROMPT = [
  "You assign exactly one Lucide icon to a life pursuit.",
  'Return STRICT JSON only: { "iconName": string | null }',
  "iconName must be a kebab-case slug from the allowed list, or null if nothing fits well.",
  "Pick the single best semantic match for the pursuit title.",
].join("\n");

export type AssignPursuitIconInput = {
  title: string;
  description?: string | null;
  lifeArea?: string | null;
};

/** PERF_PROBE — last icon assign path + ms; strip after profiling confirmed. */
export type IconAssignPerf = {
  path: "override" | "ai" | "ai_error" | "empty_title";
  ms: number;
  slug: string | null;
};

let lastIconAssignPerf: IconAssignPerf | null = null;

export function consumeIconAssignPerf(): IconAssignPerf | null {
  const snapshot = lastIconAssignPerf;
  lastIconAssignPerf = null;
  return snapshot;
}

function normalizeAssignedSlug(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  if (!slug) return null;
  return isValidLucideSlug(slug) ? slug : null;
}

async function pickIconWithAi(input: AssignPursuitIconInput): Promise<string | null> {
  const slugs = getLucideInstalledSlugs();
  const user = [
    input.lifeArea ? `Theme: ${input.lifeArea}` : null,
    `Title: ${input.title.trim()}`,
    input.description?.trim() ? `Description: ${input.description.trim()}` : null,
    "",
    "Allowed icon slugs (pick one or null):",
    slugs.join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generateJsonCompletion({
    system: ASSIGN_SYSTEM_PROMPT,
    user,
    maxTokens: 64,
    temperature: 0.1,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = assignResponseSchema.safeParse(parsed);
  if (!result.success) return null;
  return normalizeAssignedSlug(result.data.iconName);
}

/**
 * Resolve pursuit icon: preferred override → AI pick from full installed set → null (theme icon at render).
 */
export async function assignPursuitIcon(input: AssignPursuitIconInput): Promise<string | null> {
  const title = input.title.trim();
  if (!title) {
    lastIconAssignPerf = { path: "empty_title", ms: 0, slug: null };
    return null;
  }

  const overrideStart = Date.now();
  const override = matchPreferredOverrideIconSlug(title, input.description);
  if (override) {
    lastIconAssignPerf = { path: "override", ms: Date.now() - overrideStart, slug: override };
    return override;
  }

  const aiStart = Date.now();
  try {
    const aiSlug = await pickIconWithAi(input);
    lastIconAssignPerf = { path: "ai", ms: Date.now() - aiStart, slug: aiSlug };
    return aiSlug;
  } catch (err) {
    lastIconAssignPerf = { path: "ai_error", ms: Date.now() - aiStart, slug: null };
    throw err;
  }
}

export type AssignPursuitIconResult = {
  iconName: string | null;
  perf: IconAssignPerf | null;
};

/** Non-blocking wrapper for creation paths — logs and returns null on failure. */
export async function assignPursuitIconSafe(
  input: AssignPursuitIconInput,
): Promise<AssignPursuitIconResult> {
  lastIconAssignPerf = null;
  try {
    const iconName = await assignPursuitIcon(input);
    return { iconName, perf: lastIconAssignPerf };
  } catch (err) {
    console.error("[assignPursuitIcon] failed", err);
    return { iconName: null, perf: lastIconAssignPerf };
  }
}
