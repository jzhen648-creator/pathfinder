/**
 * Coerce Gemini pursuit-enrich JSON before Zod — same philosophy as tone/length clamps:
 * salvage valid clarifiers/insight; drop or fix drift rather than fail the whole enrich call.
 */

import {
  normalizePursuitInsightTone,
  PURSUIT_INSIGHT_BODY_MAX,
  PURSUIT_INSIGHT_HEADLINE_MAX,
} from "@/lib/insights/clamp-insight-json";

const CLARIFIER_PROMPT_MAX = 200;
const CLARIFIER_OPTION_MAX = 80;
const MILESTONE_TITLE_MAX = 120;
const MAX_CLARIFIERS = 3;
const MAX_MILESTONE_SUGGESTIONS = 6;

function truncate(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd();
}

function slugFromText(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

function coerceOptionLabel(raw: unknown): string {
  if (typeof raw === "string") return truncate(raw, CLARIFIER_OPTION_MAX);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const row = raw as Record<string, unknown>;
    const candidate = row.label ?? row.text ?? row.value ?? row.option;
    return truncate(candidate, CLARIFIER_OPTION_MAX);
  }
  return "";
}

function normalizeOptions(raw: unknown): string[] {
  if (typeof raw === "string") {
    const single = truncate(raw, CLARIFIER_OPTION_MAX);
    return single ? [single] : [];
  }
  if (!Array.isArray(raw)) return [];
  const labels = raw.map(coerceOptionLabel).filter(Boolean);
  return [...new Set(labels)].slice(0, 4);
}

function normalizeClarifiers(raw: unknown): Array<{ id: string; prompt: string; options: string[] }> {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === "object") {
    rows = Object.values(raw as Record<string, unknown>);
  }

  const out: Array<{ id: string; prompt: string; options: string[] }> = [];
  for (let i = 0; i < rows.length && out.length < MAX_CLARIFIERS; i++) {
    const entry = rows[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const prompt = truncate(row.prompt ?? row.question ?? row.text, CLARIFIER_PROMPT_MAX);
    if (!prompt) continue;

    let options = normalizeOptions(row.options ?? row.choices ?? row.answers);
    if (options.length === 1) {
      options = [...options, "Not sure"];
    }
    if (options.length < 2) continue;

    const id = truncate(row.id, 80) || slugFromText(prompt, `clarifier-${i + 1}`);
    out.push({ id, prompt, options });
  }
  return out;
}

function coerceMilestoneOrder(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return fallback;
}

function normalizeSuggestedMilestones(
  raw: unknown,
): Array<{ title: string; order: number }> | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;

  const out: Array<{ title: string; order: number }> = [];
  for (let i = 0; i < raw.length && out.length < MAX_MILESTONE_SUGGESTIONS; i++) {
    const entry = raw[i];
    let title = "";
    let order = i;

    if (typeof entry === "string") {
      title = truncate(entry, MILESTONE_TITLE_MAX);
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>;
      title = truncate(row.title ?? row.name ?? row.label ?? row.step, MILESTONE_TITLE_MAX);
      order = coerceMilestoneOrder(row.order ?? row.position ?? row.index, i);
    }

    if (!title) continue;
    out.push({ title, order });
  }

  return out.length > 0 ? out : null;
}

function normalizeInsightObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const row = { ...(raw as Record<string, unknown>) };
  const headline = truncate(row.headline ?? row.oneLiner ?? row.title, PURSUIT_INSIGHT_HEADLINE_MAX);
  const body = truncate(row.body ?? row.summary ?? row.text, PURSUIT_INSIGHT_BODY_MAX);
  if (!headline && !body) return null;

  const fromMap = truncate(row.fromMap ?? row.from_map, 200);
  const comparison = truncate(row.comparison, 200);

  return {
    tone: normalizePursuitInsightTone(row.tone),
    headline: headline || "Insight",
    body: body || "",
    ...(fromMap ? { fromMap } : {}),
    ...(comparison ? { comparison } : {}),
  };
}

/** Nest flat insight fields and normalize enrich-specific arrays on one pursuit entry. */
export function normalizePursuitEnrichEntry(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const row = { ...(entry as Record<string, unknown>) };

  let insight =
    row.insight != null ? normalizeInsightObject(row.insight) : null;

  const hasFlatInsight =
    "headline" in row || "body" in row || "oneLiner" in row || "tone" in row;
  if (!insight && hasFlatInsight) {
    insight = normalizeInsightObject(row);
  }

  const clarifiers = normalizeClarifiers(row.clarifiers);
  const suggestedMilestones = normalizeSuggestedMilestones(row.suggestedMilestones);

  return {
    clarifiers,
    insight,
    suggestedMilestones,
  };
}

/** Normalize all pursuit entries under a batch wrapper or pursuits map. */
export function normalizePursuitEnrichBatch(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const root = { ...(json as Record<string, unknown>) };

  const pursuits = root.pursuits;
  if (!pursuits || typeof pursuits !== "object" || Array.isArray(pursuits)) {
    return root;
  }

  const normalized: Record<string, unknown> = {};
  for (const [pursuitId, entry] of Object.entries(pursuits as Record<string, unknown>)) {
    const row = normalizePursuitEnrichEntry(entry);
    if (row) normalized[pursuitId] = row;
  }
  root.pursuits = normalized;
  return root;
}
