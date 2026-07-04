import type { PursuitInsightTone } from "@/lib/insights/insight-types";
import {
  PURSUIT_INSIGHT_BODY_MAX,
  PURSUIT_INSIGHT_COMPARISON_MAX,
  PURSUIT_INSIGHT_HEADLINE_MAX,
} from "@/lib/insights/insight-field-limits";
import { normalizeLegacyPursuitTone } from "@/lib/insights/resolve-pursuit-insight-tone";
import { stripSignificanceEcho } from "@/lib/insights/strip-significance-echo";

/** Max lengths aligned with Zod schemas in insight-types / pursuit-enrich-types. */
export {
  PURSUIT_INSIGHT_BODY_MAX,
  PURSUIT_INSIGHT_COMPARISON_MAX,
  PURSUIT_INSIGHT_HEADLINE_MAX,
} from "@/lib/insights/insight-field-limits";

export type { PursuitInsightTone };

/** Coerce Gemini tone drift before Zod — maps legacy values to the four-tone contract. */
export function normalizePursuitInsightTone(raw: unknown): PursuitInsightTone {
  return normalizeLegacyPursuitTone(raw);
}

/** Trim text to max length on a word boundary; append … when shortened. */
export function truncateAtWordBoundary(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const budget = max - 1;
  let slice = trimmed.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) {
    slice = slice.slice(0, lastSpace);
  }
  return `${slice.trimEnd()}…`;
}

/** Trim pursuit insight headline to max length on a word boundary; append … when shortened. */
export function truncatePursuitInsightHeadline(
  text: string,
  max = PURSUIT_INSIGHT_HEADLINE_MAX,
): string {
  return truncateAtWordBoundary(text, max);
}

function truncateString(value: unknown, max: number): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}

function truncateHeadline(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return truncatePursuitInsightHeadline(value);
}

function clampPursuitInsightFields(row: Record<string, unknown>): void {
  if ("tone" in row) {
    row.tone = normalizePursuitInsightTone(row.tone);
  }
  if ("headline" in row && typeof row.headline === "string") {
    row.headline = truncateHeadline(stripSignificanceEcho(row.headline));
  }
  if ("body" in row && typeof row.body === "string") {
    row.body = truncateString(stripSignificanceEcho(row.body), PURSUIT_INSIGHT_BODY_MAX);
  }
  if ("comparison" in row && typeof row.comparison === "string") {
    row.comparison = truncateString(stripSignificanceEcho(row.comparison), PURSUIT_INSIGHT_COMPARISON_MAX);
  }
}

function clampPursuitsMap(pursuits: unknown): void {
  if (!pursuits || typeof pursuits !== "object" || Array.isArray(pursuits)) return;
  for (const entry of Object.values(pursuits as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if ("headline" in row || "body" in row || "comparison" in row) {
      clampPursuitInsightFields(row);
    }
    if (row.insight && typeof row.insight === "object" && !Array.isArray(row.insight)) {
      clampPursuitInsightFields(row.insight as Record<string, unknown>);
    }
  }
}

/** Gemini sometimes returns global.sections as an object — coerce to the array Zod expects. */
function normalizeGlobalSections(global: unknown): void {
  if (!global || typeof global !== "object" || Array.isArray(global)) return;
  const row = global as Record<string, unknown>;
  const sections = row.sections;
  if (Array.isArray(sections)) return;
  if (!sections || typeof sections !== "object") return;

  const entries = Object.entries(sections as Record<string, unknown>);
  row.sections = entries.map(([title, body]) => ({
    title,
    body: typeof body === "string" ? body : typeof body === "object" && body && "body" in (body as object)
      ? String((body as { body?: unknown }).body ?? "")
      : JSON.stringify(body),
  }));
}

function clampInsightsBranch(insights: unknown): void {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) return;
  const branch = insights as Record<string, unknown>;
  if (branch.global) {
    normalizeGlobalSections(branch.global);
  }
  if (branch.pursuits) {
    clampPursuitsMap(branch.pursuits);
  }
}

/**
 * Clamp Gemini JSON before Zod parse — avoids hard failures when headline/body exceed max length.
 */
export function clampInsightGenerationJson(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const root = { ...(json as Record<string, unknown>) };

  if (root.insights) {
    clampInsightsBranch(root.insights);
  }

  clampInsightsBranch(root);
  clampPursuitsMap(root.pursuits);

  return root;
}
