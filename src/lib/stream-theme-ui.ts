import { canonicalHubDisplayLabel } from "@/lib/category-catalog";
import { systemHubKey } from "@/lib/system-categories";
import { hubsForTheme, normalizeHubLabelKey } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import type { StreamHubUiContext, StreamThemeUiContext } from "@/types/stream";
import type { AreaData } from "@/components/tree/tree-types";

/** Build theme Stream UI context from loaded tree areas (client-side hub resolution). */
export function buildStreamThemeUiFromArea(area: AreaData): StreamThemeUiContext {
  const themeId = area.id as LifeAreaId;
  const templates = hubsForTheme(themeId);
  const hubs: StreamHubUiContext[] = [];

  for (const t of templates) {
    const key = systemHubKey(t.limbId, t.threadType);
    const branch = area.branches.find((b) => systemHubKey(themeId, b.type) === key);
    if (!branch) continue;

    const branchLabel = canonicalHubDisplayLabel(themeId, t.threadType);
    hubs.push({
      branchId: branch.id,
      areaId: themeId,
      branchLabel,
      areaLabel: area.label,
      areaColor: area.color,
      hubSlug: normalizeHubLabelKey(t.threadType),
      existingGoals: branch.goals.map((g) => ({ id: g.id, title: g.title })),
    });
  }

  return {
    themeId,
    themeName: area.label,
    themeColor: area.color,
    hubs,
  };
}

/** Build hub-scoped Stream UI context from a single branch on the tree. */
export function buildStreamHubUiFromThread(
  area: AreaData,
  thread: AreaData["branches"][number],
): StreamHubUiContext {
  const themeId = area.id as LifeAreaId;
  const branchLabel = canonicalHubDisplayLabel(themeId, thread.type);
  return {
    branchId: thread.id,
    areaId: themeId,
    branchLabel,
    areaLabel: area.label,
    areaColor: area.color,
    hubSlug: normalizeHubLabelKey(thread.type),
    existingGoals: thread.goals.map((g) => ({ id: g.id, title: g.title })),
  };
}

export function hubUiForSlug(
  theme: StreamThemeUiContext,
  hubSlug: string | undefined,
): StreamHubUiContext | null {
  if (!hubSlug?.trim()) return null;
  const norm = normalizeHubLabelKey(hubSlug);
  return (
    theme.hubs.find((h) => h.hubSlug === norm || normalizeHubLabelKey(h.branchLabel) === norm) ??
    null
  );
}

export function hubDisplayLabelForSlug(
  theme: StreamThemeUiContext,
  hubSlug: string | undefined,
): string {
  return hubUiForSlug(theme, hubSlug)?.branchLabel ?? hubSlug ?? "Hub";
}
