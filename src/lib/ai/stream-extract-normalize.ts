import type { ZodError } from "zod";

/** Match Stream extract Zod schemas — do not exceed product DB limits. */
export const STREAM_EXTRACT_MAX = {
  narrativeSentence: 220,
  title: 100,
  markTitle: 100,
  milestoneTitle: 100,
  description: 500,
  sourcePhrase: 200,
  reviewNote: 280,
  eventContext: 280,
  ambiguousLabel: 120,
  hubSlug: 64,
} as const;

export const STREAM_EXTRACT_TITLE_PREFERRED = 80;

function smartTruncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;

  if (max <= 3) return trimmed.slice(0, max);

  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(max * 0.5)) {
    return `${slice.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function clampStreamExtractString(
  value: unknown,
  max: number,
  path: string,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= max) return trimmed;

  const next = smartTruncate(trimmed, max);
  console.warn(
    `[stream-extract] trimmed ${path}: ${trimmed.length} → ${next.length} chars (max ${max})`,
  );
  return next;
}

function clampOptionalStringField(
  row: Record<string, unknown>,
  key: string,
  max: number,
  path: string,
): void {
  if (!(key in row)) return;
  const value = row[key];
  if (value === null || value === undefined) return;
  const clamped = clampStreamExtractString(value, max, path);
  if (clamped === undefined) return;
  row[key] = clamped;
}

function normalizeMarkRow(row: Record<string, unknown>, index: number): void {
  clampOptionalStringField(row, "title", STREAM_EXTRACT_MAX.markTitle, `marks[${index}].title`);
  clampOptionalStringField(row, "hubId", STREAM_EXTRACT_MAX.hubSlug, `marks[${index}].hubId`);
}

function normalizePursuitRow(row: Record<string, unknown>, index: number): void {
  const base = `pursuits[${index}]`;
  clampOptionalStringField(row, "title", STREAM_EXTRACT_MAX.title, `${base}.title`);
  clampOptionalStringField(row, "description", STREAM_EXTRACT_MAX.description, `${base}.description`);
  clampOptionalStringField(row, "sourcePhrase", STREAM_EXTRACT_MAX.sourcePhrase, `${base}.sourcePhrase`);
  clampOptionalStringField(row, "suggestedTitle", STREAM_EXTRACT_MAX.title, `${base}.suggestedTitle`);
  clampOptionalStringField(row, "reviewNote", STREAM_EXTRACT_MAX.reviewNote, `${base}.reviewNote`);
  clampOptionalStringField(row, "eventContext", STREAM_EXTRACT_MAX.eventContext, `${base}.eventContext`);
  clampOptionalStringField(row, "hubId", STREAM_EXTRACT_MAX.hubSlug, `${base}.hubId`);
}

function normalizeMilestoneRow(row: Record<string, unknown>, index: number): void {
  const base = `milestones[${index}]`;
  clampOptionalStringField(row, "title", STREAM_EXTRACT_MAX.milestoneTitle, `${base}.title`);
  clampOptionalStringField(row, "hubId", STREAM_EXTRACT_MAX.hubSlug, `${base}.hubId`);
}

function normalizePursuitUpdateRow(row: Record<string, unknown>, index: number): void {
  clampOptionalStringField(row, "title", STREAM_EXTRACT_MAX.title, `pursuitUpdates[${index}].title`);
}

function normalizeMilestoneUpdateRow(row: Record<string, unknown>, index: number): void {
  clampOptionalStringField(row, "title", STREAM_EXTRACT_MAX.title, `milestoneUpdates[${index}].title`);
}

function normalizeAmbiguousRow(row: Record<string, unknown>, index: number): void {
  clampOptionalStringField(row, "label", STREAM_EXTRACT_MAX.ambiguousLabel, `ambiguous[${index}].label`);
  clampOptionalStringField(row, "hubId", STREAM_EXTRACT_MAX.hubSlug, `ambiguous[${index}].hubId`);
}

function normalizeObjectArray(
  raw: unknown,
  normalizeRow: (row: Record<string, unknown>, index: number) => void,
): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const row = { ...(item as Record<string, unknown>) };
    normalizeRow(row, index);
    return row;
  });
}

/** Trim overlong model strings before Zod parse so one field cannot fail the whole extract. */
export function normalizeStreamExtractFieldLengths(json: unknown): unknown {
  if (json === null || json === undefined || typeof json !== "object" || Array.isArray(json)) {
    return json;
  }

  const row = { ...(json as Record<string, unknown>) };

  if (typeof row.narrativeSentence === "string") {
    const clamped = clampStreamExtractString(
      row.narrativeSentence,
      STREAM_EXTRACT_MAX.narrativeSentence,
      "narrativeSentence",
    );
    if (clamped !== undefined) row.narrativeSentence = clamped;
  }

  row.marks = normalizeObjectArray(row.marks, normalizeMarkRow);
  row.pursuits = normalizeObjectArray(row.pursuits, normalizePursuitRow);
  row.milestones = normalizeObjectArray(row.milestones, normalizeMilestoneRow);
  row.pursuitUpdates = normalizeObjectArray(row.pursuitUpdates, normalizePursuitUpdateRow);
  row.milestoneUpdates = normalizeObjectArray(row.milestoneUpdates, normalizeMilestoneUpdateRow);
  row.ambiguous = normalizeObjectArray(row.ambiguous, normalizeAmbiguousRow);

  return row;
}

function pathKey(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function maxForPath(path: PropertyKey[]): number | null {
  const joined = pathKey(path);
  if (joined === "narrativeSentence") return STREAM_EXTRACT_MAX.narrativeSentence;
  if (joined.endsWith(".title")) {
    if (joined.startsWith("marks")) return STREAM_EXTRACT_MAX.markTitle;
    if (joined.startsWith("milestones")) return STREAM_EXTRACT_MAX.milestoneTitle;
    return STREAM_EXTRACT_MAX.title;
  }
  if (joined.endsWith(".description")) return STREAM_EXTRACT_MAX.description;
  if (joined.endsWith(".sourcePhrase")) return STREAM_EXTRACT_MAX.sourcePhrase;
  if (joined.endsWith(".suggestedTitle")) return STREAM_EXTRACT_MAX.title;
  if (joined.endsWith(".reviewNote")) return STREAM_EXTRACT_MAX.reviewNote;
  if (joined.endsWith(".eventContext")) return STREAM_EXTRACT_MAX.eventContext;
  if (joined.endsWith(".label")) return STREAM_EXTRACT_MAX.ambiguousLabel;
  if (joined.endsWith(".hubId")) return STREAM_EXTRACT_MAX.hubSlug;
  return null;
}

function setAtPath(root: Record<string, unknown>, path: PropertyKey[], value: string): void {
  if (path.length === 0) return;
  let current: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]!;
    if (!current || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[String(key)];
  }
  const last = path[path.length - 1]!;
  if (!current || typeof current !== "object" || Array.isArray(current)) return;
  (current as Record<string, unknown>)[String(last)] = value;
}

function readAtPath(root: unknown, path: PropertyKey[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[String(key)];
  }
  return current;
}

/** Second pass when Zod still reports too_big after preprocess normalization. */
export function repairStreamExtractSchemaViolations(data: unknown, error: ZodError): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const row = { ...(data as Record<string, unknown>) };

  for (const issue of error.issues) {
    if (issue.code !== "too_big" || issue.path.length === 0) continue;
    const max = maxForPath(issue.path);
    if (!max) continue;
    const current = readAtPath(row, issue.path);
    const clamped = clampStreamExtractString(current, max, pathKey(issue.path));
    if (clamped !== undefined) {
      setAtPath(row, issue.path, clamped);
    }
  }

  return row;
}

export function formatStreamExtractValidationFailure(
  message: string,
  path: string,
  rawValue: unknown,
): string {
  const length = typeof rawValue === "string" ? rawValue.length : null;
  const lengthNote = length === null ? "" : ` (field length ${length})`;
  return `${message} (at ${path})${lengthNote}`;
}
