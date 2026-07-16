/** Advisory insight quality flags — never gates CI. */

import { hasRiddleCloser, isAdministrativeEcho } from "@/lib/insights/insight-clarity";

export const BANNED_FILLER = ["connective tissue", "threads together", "woven through"] as const;

export const BANNED_FORECAST = [
  "might mean",
  "could impact",
  "potentially pushing",
  "this puts you at risk of",
  "potentially ",
] as const;

export const BANNED_STATUS_NARRATION = ["active pursuit", "maintaining status"] as const;

export const BANNED_RIDDLE = [
  "the gap is the story",
  "gap is still the story",
  "is the story",
  "long-range anchor",
  "through-line",
] as const;

export const BANNED_ADMIN_ECHO = [
  "milestones complete",
  "deadline in",
  " in progress",
  " active)",
] as const;

type PursuitPanel = { headline?: string; body?: string; fromMap?: string; comparison?: string };
type ThemePanel = {
  oneLiner?: string;
  reflective?: string;
  combined?: string;
  contextual?: string;
};

export type InsightQualityPayload = {
  reading?: string;
  pursuits?: Record<string, PursuitPanel>;
  themes?: Record<string, ThemePanel>;
};

export function gradeInsightQuality(payload: InsightQualityPayload): string[] {
  const flags: string[] = [];

  const reading = payload.reading?.toLowerCase() ?? "";
  for (const phrase of BANNED_FILLER) {
    if (reading.includes(phrase)) flags.push(`banned-filler:${phrase}`);
  }

  for (const panel of Object.values(payload.pursuits ?? {})) {
    flags.push(...gradeProse(`${panel.headline ?? ""} ${panel.body ?? ""}`, "pursuit"));
    flags.push(...gradeProse(`${panel.fromMap ?? ""} ${panel.comparison ?? ""}`, "pursuit-supplement"));
  }

  for (const panel of Object.values(payload.themes ?? {})) {
    flags.push(
      ...gradeProse(
        `${panel.oneLiner ?? ""} ${panel.reflective ?? ""} ${panel.combined ?? ""} ${panel.contextual ?? ""}`,
        "theme",
      ),
    );
  }

  return [...new Set(flags)];
}

function gradeProse(prose: string, scope: "pursuit" | "pursuit-supplement" | "theme"): string[] {
  const flags: string[] = [];
  const lower = prose.toLowerCase();

  if (scope === "pursuit") {
    for (const phrase of BANNED_STATUS_NARRATION) {
      if (lower.includes(phrase)) flags.push(`status-narration-headline:${phrase}`);
    }
  }

  for (const phrase of BANNED_FORECAST) {
    if (lower.includes(phrase)) flags.push(`banned-forecast:${phrase}`);
  }

  for (const phrase of BANNED_FILLER) {
    if (lower.includes(phrase)) flags.push(`banned-filler:${phrase}`);
  }

  for (const phrase of BANNED_RIDDLE) {
    if (lower.includes(phrase)) flags.push(`banned-riddle:${phrase}`);
  }
  if (hasRiddleCloser(prose)) flags.push("banned-riddle:closer");

  for (const phrase of BANNED_ADMIN_ECHO) {
    if (lower.includes(phrase)) flags.push(`banned-admin:${phrase.trim()}`);
  }
  if (isAdministrativeEcho(prose)) flags.push("banned-admin:echo");

  return flags;
}

export function gradeInsightQualityJson(raw: string): string[] {
  try {
    return gradeInsightQuality(JSON.parse(raw) as InsightQualityPayload);
  } catch {
    return ["invalid-json"];
  }
}
