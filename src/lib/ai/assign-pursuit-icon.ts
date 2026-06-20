import { z } from "zod";
import { canonicalCategoryDisplayLabel } from "@/lib/category-catalog";
import { generateJsonCompletion } from "@/lib/gemini";
import { generateGoalShortLabel, resolvePursuitShortLabel } from "@/lib/goal-short-label";
import { getLucideInstalledSlugs, isValidLucideSlug } from "@/lib/icons/enumerate-lucide-slugs";
import { matchPreferredOverrideIconSlug } from "@/lib/icons/match-pursuit-icon-override";
import { prisma } from "@/lib/prisma";

const assignResponseSchema = z.object({
  iconName: z.string().nullable().optional(),
  shortLabel: z.string().nullable().optional(),
});

const ASSIGN_SYSTEM_PROMPT = [
  "You assign a Lucide icon and a compact map canvas label for a life pursuit.",
  'Return STRICT JSON only: { "iconName": string | null, "shortLabel": string | null }',
  "iconName must be a kebab-case slug from the allowed list, or null if nothing fits well.",
  "shortLabel: max 3 words, no ellipsis. Keep numbers, currency, magnitudes (e.g. £500k, 5k), acronyms (ISA, CEMAP), and proper nouns.",
  "Drop filler verbs (build, get, start, create, achieve, complete, establish) and generic nouns (goal, plan).",
  "Prefer the distinguishing noun phrase over deadlines unless the date is the main differentiator.",
  "Sentence case; preserve original casing for proper nouns and symbols.",
  'Example: "Build £500k Stocks and Shares ISA" → shortLabel "£500k ISA".',
  'Example: "Complete CEMAP Module 1 by March 2026" → shortLabel "CEMAP Module 1".',
].join("\n");

export type AssignPursuitIconInput = {
  title: string;
  description?: string | null;
  lifeArea?: string | null;
  sectionLabel?: string | null;
  status?: string | null;
  siblingPursuitTitles?: string[];
  /** Per-user queue key — serializes with Stream and insights for one account. */
  queueKey?: string | null;
};

export type AssignPursuitVisualsResult = {
  iconName: string | null;
  shortLabel: string | null;
};

function normalizeAssignedSlug(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  if (!slug) return null;
  return isValidLucideSlug(slug) ? slug : null;
}

async function pickVisualsWithAi(
  input: AssignPursuitIconInput,
): Promise<{ iconName: string | null; shortLabelRaw: string | null }> {
  const slugs = getLucideInstalledSlugs();
  const user = [
    input.lifeArea ? `Theme: ${input.lifeArea}` : null,
    input.sectionLabel?.trim() ? `Section: ${input.sectionLabel.trim()}` : null,
    input.status?.trim() ? `Status: ${input.status.trim()}` : null,
    `Title: ${input.title.trim()}`,
    input.description?.trim() ? `Description: ${input.description.trim()}` : null,
    input.siblingPursuitTitles?.length
      ? `Other pursuits in this theme: ${input.siblingPursuitTitles.join("; ")}`
      : null,
    "",
    "Allowed icon slugs (pick one or null):",
    slugs.join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generateJsonCompletion({
    system: ASSIGN_SYSTEM_PROMPT,
    user,
    maxTokens: 128,
    temperature: 0.1,
    queueKey: input.queueKey,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { iconName: null, shortLabelRaw: null };
  }

  const result = assignResponseSchema.safeParse(parsed);
  if (!result.success) return { iconName: null, shortLabelRaw: null };

  const shortLabelRaw =
    typeof result.data.shortLabel === "string" ? result.data.shortLabel.trim() || null : null;

  return {
    iconName: normalizeAssignedSlug(result.data.iconName),
    shortLabelRaw,
  };
}

/**
 * Resolve pursuit icon + canvas short label: preferred icon override → AI pick → heuristic shortLabel fallback.
 */
export async function assignPursuitVisuals(
  input: AssignPursuitIconInput,
): Promise<AssignPursuitVisualsResult> {
  const title = input.title.trim();
  if (!title) return { iconName: null, shortLabel: null };

  const override = matchPreferredOverrideIconSlug(title, input.description);
  if (override) {
    return {
      iconName: override,
      shortLabel: resolvePursuitShortLabel(null, title, input.description),
    };
  }

  const ai = await pickVisualsWithAi(input);
  const iconName = ai.iconName;
  const shortLabel = resolvePursuitShortLabel(ai.shortLabelRaw, title, input.description);

  return { iconName, shortLabel };
}

/** Non-blocking wrapper for creation paths — logs and returns nulls on failure (heuristic shortLabel when possible). */
export async function assignPursuitVisualsSafe(
  input: AssignPursuitIconInput,
): Promise<AssignPursuitVisualsResult> {
  try {
    return await assignPursuitVisuals(input);
  } catch (err) {
    console.error("[assignPursuitVisuals] failed", err);
    const title = input.title.trim();
    return {
      iconName: null,
      shortLabel: title ? generateGoalShortLabel(title, input.description) : null,
    };
  }
}

/** @deprecated Use assignPursuitVisuals — icon only. */
export async function assignPursuitIcon(input: AssignPursuitIconInput): Promise<string | null> {
  const result = await assignPursuitVisuals(input);
  return result.iconName;
}

/** @deprecated Use assignPursuitVisualsSafe — icon only. */
export async function assignPursuitIconSafe(
  input: AssignPursuitIconInput,
): Promise<string | null> {
  const result = await assignPursuitVisualsSafe(input);
  return result.iconName;
}

/** Re-run AI icon + shortLabel assignment for an existing goal (e.g. after title change). */
export async function persistPursuitVisualsForGoal(goalId: string): Promise<void> {
  const row = await prisma.goal.findFirst({
    where: { id: goalId },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      lifeArea: true,
      themeId: true,
      goalType: true,
      iconName: true,
      status: true,
      themeCategory: { select: { label: true, themeId: true } },
    },
  });
  if (!row) return;
  if (row.goalType === "moment" || row.goalType === "event") return;

  const themeId = row.themeId ?? row.themeCategory?.themeId ?? row.lifeArea;
  const hubLabel = row.themeCategory?.label ?? "";
  const sectionLabel = themeId
    ? canonicalCategoryDisplayLabel(themeId, hubLabel)
    : hubLabel;

  const { iconName, shortLabel } = await assignPursuitVisualsSafe({
    title: row.title,
    description: row.description,
    lifeArea: row.lifeArea ?? themeId,
    sectionLabel,
    status: row.status,
    queueKey: row.userId,
  });

  const data: { iconName?: string; shortLabel?: string } = {};
  if (!row.iconName && iconName) data.iconName = iconName;
  if (shortLabel) data.shortLabel = shortLabel;
  if (Object.keys(data).length === 0) return;

  await prisma.goal.update({ where: { id: goalId }, data });
}
