/** Phase 3 — Prisma uses `categoryId`; JSON mirrors legacy `branchId` for mobile compat. */

export type WithCategoryId = { categoryId: string | null };

/** @deprecated Use WithCategoryId */
export type WithBranchId = WithCategoryId;

export function withBranchIdMirror<T extends WithCategoryId>(
  row: T,
): T & { branchId: string | null } {
  return { ...row, branchId: row.categoryId };
}

export function withBranchIdMirrors<T extends WithCategoryId>(
  rows: T[],
): Array<T & { branchId: string | null }> {
  return rows.map(withBranchIdMirror);
}

/** @deprecated Use withBranchIdMirror — kept for call sites during migration */
export const withCategoryIdMirror = withBranchIdMirror;

export const withCategoryIdMirrors = withBranchIdMirrors;

export function resolveBranchIdFromBody(body: {
  branchId?: string | null;
  categoryId?: string | null;
}): string {
  return String(body.categoryId ?? body.branchId ?? "").trim();
}

/** Hub-scoped Stream extract/commit — `categoryId` is the ThemeCategory row id (same as legacy `hubId`). */
export function resolveStreamHubBranchIdFromBody(body: {
  hubId?: string | null;
  categoryId?: string | null;
}): string {
  return String(body.categoryId ?? body.hubId ?? "").trim();
}

export function hasStreamHubScopeInBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return (
    (typeof record.hubId === "string" && record.hubId.trim().length > 0) ||
    (typeof record.categoryId === "string" && record.categoryId.trim().length > 0)
  );
}

/** Coalesce hub-scoped Stream body fields before validation. */
export function normalizeStreamHubScopeInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  const branchId = resolveStreamHubBranchIdFromBody(
    record as { hubId?: string; categoryId?: string },
  );
  if (branchId) {
    record.hubId = branchId;
    record.categoryId = branchId;
  }
  return record;
}

export type WithHubSlug = { hubId?: string | null; categorySlug?: string | null };

/** Normalize Stream slug fields — `categorySlug` is the preferred name; `hubId` kept for compat. */
export function withCategorySlugMirror<T extends WithHubSlug>(
  row: T,
): T & { hubId?: string; categorySlug?: string } {
  const slug = String(row.categorySlug ?? row.hubId ?? "").trim();
  if (!slug) return row as T & { hubId?: string; categorySlug?: string };
  return { ...row, hubId: slug, categorySlug: slug };
}

export function withCategorySlugMirrors<T extends WithHubSlug>(
  rows: T[],
): Array<T & { hubId?: string; categorySlug?: string }> {
  return rows.map(withCategorySlugMirror);
}

export function normalizeCategoryIdInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  const resolved = resolveBranchIdFromBody(record as { branchId?: string; categoryId?: string });
  if (resolved) {
    record.categoryId = resolved;
    record.branchId = resolved;
  }
  return record;
}

export function normalizeHubSlugInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  if (!record.hubId && record.categorySlug) {
    record.hubId = record.categorySlug;
  }
  return record;
}

/** Coalesce routing slug on Stream commit items before validation. */
export function normalizeStreamCommitBody(body: unknown): unknown {
  return normalizeStreamHubScopeInBody(normalizeStreamCommitItemSlugs(body));
}

function normalizeStreamCommitItemSlugs(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  for (const key of ["marks", "pursuits", "milestones"] as const) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    record[key] = items.map((item) =>
      item && typeof item === "object" ? withCategorySlugMirror(item as WithHubSlug) : item,
    );
  }
  return record;
}

type StreamExtractShape = {
  marks?: WithHubSlug[];
  pursuits?: WithHubSlug[];
  milestones?: WithHubSlug[];
  ambiguous?: WithHubSlug[];
};

/** Mirror `hubId` → `categorySlug` on Stream extract responses. */
export function mirrorStreamExtractResponse<T extends StreamExtractShape>(result: T): T {
  return {
    ...result,
    marks: result.marks ? withCategorySlugMirrors(result.marks) : result.marks,
    pursuits: result.pursuits ? withCategorySlugMirrors(result.pursuits) : result.pursuits,
    milestones: result.milestones
      ? withCategorySlugMirrors(result.milestones)
      : result.milestones,
    ambiguous: result.ambiguous
      ? withCategorySlugMirrors(result.ambiguous)
      : result.ambiguous,
  };
}
