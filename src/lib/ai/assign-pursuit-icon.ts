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
  if (!title) return null;

  const override = matchPreferredOverrideIconSlug(title, input.description);
  if (override) return override;

  return pickIconWithAi(input);
}

/** Non-blocking wrapper for creation paths — logs and returns null on failure. */
export async function assignPursuitIconSafe(
  input: AssignPursuitIconInput,
): Promise<string | null> {
  try {
    return await assignPursuitIcon(input);
  } catch (err) {
    console.error("[assignPursuitIcon] failed", err);
    return null;
  }
}
