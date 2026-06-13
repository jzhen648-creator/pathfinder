export type ReadingDirtyFieldChange = {
  field: string;
  from?: string | number | null;
  to?: string | number | null;
};

export type ReadingDirtyDetails = {
  changes?: ReadingDirtyFieldChange[];
  event?: string;
  title?: string;
  milestoneTitle?: string;
};

function serializeValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

export function buildFieldChanges(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
  fields: string[],
): ReadingDirtyFieldChange[] {
  const changes: ReadingDirtyFieldChange[] = [];
  for (const field of fields) {
    if (!(field in updates)) continue;
    const from = serializeValue(existing[field]);
    const to = serializeValue(updates[field]);
    if (from === to) continue;
    changes.push({ field, from, to });
  }
  return changes;
}

export function parseReadingDirtyDetails(raw: unknown): ReadingDirtyDetails | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ReadingDirtyDetails;
}
