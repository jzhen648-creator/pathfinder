/** JSON mirrors for physical `themeId` column rename — mobile still reads `limbId`. */

export type WithThemeId = { themeId: string | null | undefined };

export function withLimbIdMirror<T extends WithThemeId>(
  row: T,
): T & { limbId: string | null | undefined } {
  const themeId = row.themeId ?? null;
  return { ...row, limbId: themeId };
}

export function withLimbIdMirrors<T extends WithThemeId>(
  rows: T[],
): Array<T & { limbId: string | null | undefined }> {
  return rows.map(withLimbIdMirror);
}

/** @deprecated Use withLimbIdMirror */
export const withThemeIdMirror = withLimbIdMirror;

export const withThemeIdMirrors = withLimbIdMirrors;

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
    record.limbId = resolved;
  }
  return record;
}

/** Apply categoryId + themeId JSON mirrors on map payload rows. */
export function withMapEntityMirrors<
  T extends { categoryId?: string | null; themeId?: string | null },
>(row: T): T & { branchId?: string | null; limbId?: string | null } {
  const categoryId = row.categoryId ?? null;
  const themeId = row.themeId ?? null;
  return {
    ...row,
    branchId: categoryId,
    limbId: themeId,
  };
}

export function withMapEntityMirrorsList<
  T extends { categoryId?: string | null; themeId?: string | null },
>(rows: T[]): Array<T & { branchId?: string | null; limbId?: string | null }> {
  return rows.map(withMapEntityMirrors);
}
