/** Request coalescing for taxonomy category row ids — responses use `categoryId` only. */

export type WithCategoryId = { categoryId: string | null };

export function resolveBranchIdFromBody(body: {
  branchId?: string | null;
  categoryId?: string | null;
}): string {
  return String(body.categoryId ?? body.branchId ?? "").trim();
}

/** Hub-scoped Stream extract/commit — `categoryId` is the ThemeCategory row id. */
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

/** Coalesce hub-scoped Stream body fields before validation (request only). */
export function normalizeStreamHubScopeInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  const categoryId = resolveStreamHubBranchIdFromBody(
    record as { hubId?: string; categoryId?: string },
  );
  if (categoryId) {
    record.categoryId = categoryId;
  }
  return record;
}

export type WithCategorySlug = { categorySlug?: string | null; hubId?: string | null };

export function resolveCategorySlugFromItem(item: WithCategorySlug): string {
  return String(item.categorySlug ?? item.hubId ?? "").trim();
}

export function normalizeCategoryIdInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  const resolved = resolveBranchIdFromBody(record as { branchId?: string; categoryId?: string });
  if (resolved) {
    record.categoryId = resolved;
  }
  return record;
}

export function normalizeHubSlugInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  if (!record.categorySlug && record.hubId) {
    record.categorySlug = record.hubId;
  }
  return record;
}

/** Coalesce routing slug on Stream commit items before validation (request only). */
export function normalizeStreamCommitBody(body: unknown): unknown {
  return normalizeStreamHubScopeInBody(normalizeStreamCommitItemSlugs(body));
}

function normalizeStreamCommitItemSlugs(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  for (const key of ["marks", "pursuits", "milestones"] as const) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    record[key] = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = { ...(item as Record<string, unknown>) };
      const slug = resolveCategorySlugFromItem(row as WithCategorySlug);
      if (slug) row.categorySlug = slug;
      return row;
    });
  }
  return record;
}

type StreamExtractShape = {
  marks?: WithCategorySlug[];
  pursuits?: WithCategorySlug[];
  milestones?: WithCategorySlug[];
  ambiguous?: WithCategorySlug[];
};

/** Ensure Stream extract responses expose `categorySlug` (canonical). */
export function mirrorStreamExtractResponse<T extends StreamExtractShape>(result: T): T {
  const mapItems = <U extends WithCategorySlug>(items: U[] | undefined) =>
    items?.map((item) => {
      const slug = resolveCategorySlugFromItem(item);
      return slug ? { ...item, categorySlug: slug } : item;
    });

  return {
    ...result,
    marks: mapItems(result.marks),
    pursuits: mapItems(result.pursuits),
    milestones: mapItems(result.milestones),
    ambiguous: mapItems(result.ambiguous),
  };
}
