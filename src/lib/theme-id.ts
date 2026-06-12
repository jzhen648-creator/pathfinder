/** Request coalescing for theme ids — responses use `themeId` only. */

export type WithThemeId = { themeId: string | null | undefined };

export function resolveThemeIdFromBody(body: {
  limbId?: string | null;
  themeId?: string | null;
}): string {
  return String(body.themeId ?? body.limbId ?? "").trim();
}

export function normalizeThemeIdInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  const resolved = resolveThemeIdFromBody(record as { limbId?: string; themeId?: string });
  if (resolved) {
    record.themeId = resolved;
  }
  return record;
}
