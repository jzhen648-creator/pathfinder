/**
 * Macro composition / depth staging for the tree map (render-only).
 * Draw order and per-limb drift/scale only — limb tone/brightness is uniform across areas.
 * Focus limb mode highlights connective paths in-tree instead of dimming sibling themes.
 */
import type { LifeAreaId } from "@/lib/types";

export type LimbStagingPlane = "back" | "mid" | "forward" | "fore";

export type LimbDepthStaging = {
  plane: LimbStagingPlane;
  /** Lower draws earlier (behind). */
  sortKey: number;
  /** Whole-limb opacity (focus rules applied here). */
  groupOpacityMul: number;
  /** Branch-stroke opacity multiplier (uniform across limbs). */
  branchStrokeOpacityMul: number;
  /** CSS filter on limb group — unused when all limbs share the same luminance. */
  limbVisualFilter: string | undefined;
  /** CSS transform on whole limb: drift + scale around scene origin (render-only). */
  limbComposeTransform: string | undefined;
  /** Hull / filament / carry presence multiplier. */
  hullMassPresenceMul: number;
};

/**
 * Draw order: earlier = behind. Intentionally uneven so canopies interpenetrate.
 * Health / finance read deeper; people / work / becoming stack forward.
 */
const STAGING_SORT: Record<LifeAreaId, number> = {
  health: 4,
  finance: 20,
  pleasures: 33,
  work: 46,
  people: 71,
  becoming: 96,
};

export type LimbStagingContext = {
  focusedAreaId: string | null;
  focusLimbMode: boolean;
  focusedLimbId: string | null;
};

export function getLimbDepthStaging(areaId: string, ctx: LimbStagingContext): LimbDepthStaging {
  const id = areaId as LifeAreaId;
  const sortKey = STAGING_SORT[id] ?? 36;
  const plane: LimbStagingPlane =
    sortKey < 16 ? "back" : sortKey < 36 ? "mid" : sortKey < 60 ? "forward" : "fore";

  const branchStrokeOpacityMul = 1;
  const limbVisualFilter: string | undefined = undefined;
  const hullMassPresenceMul = 1;

  let limbComposeTransform: string | undefined;
  if (id === "becoming") {
    limbComposeTransform = "translate(2,-32) scale(1.055)";
  } else if (id === "people") {
    limbComposeTransform = "translate(34,14) scale(1.04)";
  } else if (id === "work") {
    limbComposeTransform = "translate(-26,2) scale(0.97)";
  } else if (id === "health") {
    limbComposeTransform = "translate(18,38) scale(0.97)";
  } else if (id === "finance") {
    limbComposeTransform = "translate(-40,18) scale(0.96)";
  }

  let groupOpacityMul = 1;

  if (ctx.focusLimbMode && ctx.focusedLimbId != null && areaId === ctx.focusedLimbId) {
    limbComposeTransform = undefined;
  } else if (ctx.focusedAreaId != null && ctx.focusedAreaId !== areaId) {
    groupOpacityMul *= 0.58;
  }

  return {
    plane,
    sortKey,
    groupOpacityMul,
    branchStrokeOpacityMul,
    limbVisualFilter,
    limbComposeTransform,
    hullMassPresenceMul: Math.max(0.72, Math.min(1, hullMassPresenceMul)),
  };
}

/** Uniform branch-group opacity along a limb (no outer-tip dimming via this channel). */
export function intraLimbBranchDepthMul(_kFork: number, _branchCount: number): number {
  return 1;
}
