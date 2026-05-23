import type { AreaData, DomainHubData } from "./tree-types";
import type { LifeAreaId } from "@/lib/types";
import {
  branchMainPathUntilGlobalT,
  buildAreaForkFromAnchors,
  compareBranchIndicesForStemOrder,
  defaultHubSlotCountForArea,
  trunkHubFanSlotIndex,
  type AreaForkSpec,
} from "./tree-forks";
import {
  domainClusterGatewaySpreadNormalForForkSpec,
  domainClusterHubPointFromCatalog,
} from "./tree-branch-geometry";
import type { AreaLayoutOverride } from "./tree-layout-edit";
import type { TrunkLayoutAnchorPair } from "./tree-trunk-slots";
import { hubsForTheme, type HubTemplate } from "@/lib/taxonomy";
import type { Point } from "./tree-types";
export type NodeVisualState = "dormant" | "ghost" | "live";

/**
 * Derives the visual state for a theme (life area) node.
 * - `dormant`: theme not yet unlocked — greyed-out, slow breathing pulse, desaturated.
 * - `ghost`: theme unlocked but has no active hubs — outline style, faster pulse.
 * - `live`: theme active with content — full colour, no animation.
 */
export function deriveThemeVisualState(
  area: Pick<AreaData, "id" | "branches">,
  unlockedLimbIds: readonly string[],
): NodeVisualState {
  if (!unlockedLimbIds.includes(area.id)) return "dormant";
  if (area.branches.length === 0) return "ghost";
  return "live";
}

/**
 * Derives the visual state for an individual hub node.
 * - `dormant`: parent theme is not yet unlocked.
 * - `ghost`: theme is unlocked but this hub has not been individually activated.
 * - `live`: hub is active.
 */
export function deriveHubVisualState(
  _hub: Pick<DomainHubData, "id">,
  isThemeUnlocked: boolean,
  isHubActive: boolean,
): NodeVisualState {
  if (!isThemeUnlocked) return "dormant";
  if (!isHubActive) return "ghost";
  return "live";
}

export type GhostHubSlot = {
  tip: Point;
  template: HubTemplate;
  slotIndex: number;
};

/**
 * Computes ghost hub positions for an unlocked-but-empty theme.
 *
 * Uses the same hub-anchor calculation as live branch rendering, including the trunk fan
 * slot mapping, so activated hubs do not jump away from their ghost position.
 *
 * Only call when the theme is `isUnlockedEmpty` (unlocked, no active branches).
 */
export function ghostHubSlotsForArea(
  areaId: LifeAreaId,
  opts: {
    forkSpec?: AreaForkSpec;
    layoutOv?: AreaLayoutOverride;
    layoutAnchors?: TrunkLayoutAnchorPair;
  } = {},
): GhostHubSlot[] {
  const templates = [...hubsForTheme(areaId)];
  const maxSlots = defaultHubSlotCountForArea(areaId);
  if (maxSlots === 0) return [];

  // Synthetic full-slot area lets live fork geometry calculate where all taxonomy hubs will land.
  const syntheticArea: AreaData = {
    id: areaId,
    label: "",
    color: "",
    summary: null,
    branches: Array.from({ length: maxSlots }, (_, i) => ({
      id: `__ghost_${areaId}_${i}`,
      type: templates[i]?.threadType ?? "",
      moments: [],
      goals: [],
      sequencedNodes: [],
    })),
  };

  const forkSpec = opts.forkSpec ?? buildAreaForkFromAnchors(areaId, syntheticArea);
  const sortedBranchIdx = forkSpec.branches
    .map((_, i) => i)
    .sort((a, b) => compareBranchIndicesForStemOrder(forkSpec, a, b));
  const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(forkSpec);

  return templates.map((template, i) => ({
    tip: forkSpec.branches[i]
      ? domainClusterHubPointFromCatalog(
          branchMainPathUntilGlobalT(forkSpec.branches[i], 1),
          trunkHubFanSlotIndex(areaId, i, sortedBranchIdx),
          sortedBranchIdx.length,
          dcGatewaySpreadNormal,
          areaId,
          opts.layoutOv,
          opts.layoutAnchors,
        )
      : forkSpec.limbTip,
    template,
    slotIndex: i,
  }));
}
