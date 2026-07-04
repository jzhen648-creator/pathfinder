import { createHash } from "crypto";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";

/**
 * Stable hash of map structure for future Gemini context caching.
 * Excludes volatile fields (background, enrichAnswers, milestone descriptions).
 *
 * Explicit caching is NOT wired yet — decision gated on prod `realTokenUsage.cacheHitRate`.
 * See `pathfinder/docs/AI-SYNC-COST-MODEL.md` § "Follow-up gate: Gemini explicit context caching".
 */
export function buildMapContextStructureKey(mapContext: FormattedMapContext): string {
  const skeleton = mapContext.themes.map((theme) => ({
    id: theme.id,
    categories: theme.categories.map((category) => ({
      id: category.id,
      pursuits: category.pursuits.map((pursuit) => ({
        id: pursuit.id,
        title: pursuit.title,
        status: pursuit.status,
        milestoneCount: pursuit.milestones.length,
        completedMilestones: pursuit.milestones.filter((m) => m.completed).length,
      })),
    })),
  }));

  return createHash("sha256")
    .update(JSON.stringify(skeleton))
    .digest("hex")
    .slice(0, 16);
}
