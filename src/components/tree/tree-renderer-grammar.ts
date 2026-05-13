import type { DomainHubData } from "./tree-types";
import { FLAGS } from "@/lib/flags";

/**
 * Renderer **grammar bundles** — orthogonal axes used across layout, strokes, and labels without
 * scattering one-off `areaId` checks.
 *
 * - **Stem topology:** life areas use hub-and-spoke layout from {@link ./tree-area-anchors} + `AreaForkSpec`.
 * - **Goal layout:**
 *    - *longitudinal* — root goals live on the conduit at authored catalog `t`,
 *    - *domain-cluster* — root goals orbit a semantic hub anchored fork-radially; the conduit is
 *      connective only (see {@link LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS}).
 * - **Moments are an overlay, not a topology switch:** their presence does not flip domain-cluster
 *   placement on or off for life areas in {@link LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS}.
 */

/** Life areas whose root goals use polar **domain-cluster** layout + territorial hub anchor (same grammar as People). */
export const LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS = new Set<string>([
  "finance",
  "work",
  "becoming",
  "people",
  "health",
  "pleasures",
]);

export function lifeAreaUsesDomainClusterGoalLayout(areaId: string): boolean {
  return FLAGS.GOAL_MILESTONES && LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS.has(areaId);
}

/**
 * True when the thread has at least one **real** moment (not synthetic padding from `mapToTreeData`).
 * Synthetic dots must not disable domain-cluster layout.
 */
export function threadHasNonSyntheticMoments(thread: DomainHubData): boolean {
  return thread.moments.some((m) => m.synthetic !== true);
}

/**
 * Domain-cluster grammar: **fork-radial hub anchor** + 360° goal orbit + short connective conduit
 * (see `domainClusterHubAnchorFromCatalog` in `tree-branch-geometry`). Enabled for every life area
 * in {@link LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS} when milestones mode is on — *not* gated by whether
 * the thread carries timeline milestones, so progression overlays never flip topology.
 */
export function shouldDomainClusterThread(areaId: string, _thread: DomainHubData): boolean {
  return lifeAreaUsesDomainClusterGoalLayout(areaId);
}

export type GoalLayoutGrammar = "longitudinal" | "domain_cluster";

export function goalLayoutGrammarForThread(areaId: string, thread: DomainHubData): GoalLayoutGrammar {
  return shouldDomainClusterThread(areaId, thread) ? "domain_cluster" : "longitudinal";
}
