/**
 * Goal **significance** (life importance) vs **lifecycle** (BUD / GROWING / BLOOMED / ENDED).
 * Central place for render-only authority — future AI / product weighting plugs in here.
 */

import type { LifeAreaId } from "@/lib/types";
import type { TreeGoalNode } from "./tree-types";

/** Total visual authority span (~0.82× … ~1.65×) — subtle, not arcade scaling. */
export const GOAL_AUTHORITY_MUL_MIN = 0.82;
export const GOAL_AUTHORITY_MUL_MAX = 1.65;

export type GoalVisualAuthoritySpec = {
  /** Normalized 0…1 — drives all derived multipliers. */
  goalSignificance01: number;
  /** Primary aggregate scale — maps significance into {@link GOAL_AUTHORITY_MUL_MIN}…{@link GOAL_AUTHORITY_MUL_MAX}. */
  authorityMul: number;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Recursively count this goal + descendants (continuation subtree). */
export function countGoalSubtreeNodes(goal: TreeGoalNode): number {
  let n = 1;
  for (const c of goal.childGoals) n += countGoalSubtreeNodes(c);
  return n;
}

/** Conservative identity-adjacent limb bias (ontology only — not a new lifecycle). */
function lifeAreaSignificanceBias(areaId: string): number {
  const id = areaId as LifeAreaId | string;
  if (id === "becoming" || id === "people") return 0.09;
  if (id === "work") return 0.05;
  return 0;
}

/**
 * Derives 0…1 significance from structure + optional DB tier + limb context.
 * Does **not** use bloom phase — importance ≠ lifecycle completion.
 */
export function deriveGoalSignificance01(args: {
  goal: TreeGoalNode;
  depth: number;
  subtreeSize: number;
  areaId: string;
}): number {
  const { goal, depth, subtreeSize, areaId } = args;

  const depthScore = clamp01((2.5 - Math.min(depth, 5)) / 2.5);
  const treeScore = clamp01(Math.log1p(Math.max(0, subtreeSize - 1)) / Math.log1p(14));
  const forkScore = clamp01(goal.forkedGoalIds.length / 5);
  const identityNudge = lifeAreaSignificanceBias(areaId);

  const structural = clamp01(
    depthScore * 0.32 + treeScore * 0.34 + forkScore * 0.2 + identityNudge * 1.35 + 0.06,
  );

  const tier = goal.significanceTier;
  if (tier != null && tier >= 1 && tier <= 5) {
    const tier01 = (tier - 1) / 4;
    return clamp01(tier01 * 0.52 + structural * 0.48);
  }

  return clamp01(structural);
}

export function authorityMulFromSignificance(goalSignificance01: number): number {
  const s = clamp01(goalSignificance01);
  return GOAL_AUTHORITY_MUL_MIN + s * (GOAL_AUTHORITY_MUL_MAX - GOAL_AUTHORITY_MUL_MIN);
}

/** Neutral midpoint — backward-compatible when authority is omitted (tests / callers). */
export const NEUTRAL_GOAL_SIGNIFICANCE_01 = 0.5;
export const NEUTRAL_AUTHORITY_MUL = authorityMulFromSignificance(NEUTRAL_GOAL_SIGNIFICANCE_01);

export const NEUTRAL_GOAL_VISUAL_AUTHORITY: GoalVisualAuthoritySpec = {
  goalSignificance01: NEUTRAL_GOAL_SIGNIFICANCE_01,
  authorityMul: NEUTRAL_AUTHORITY_MUL,
};

export function deriveGoalVisualAuthoritySpec(args: {
  goal: TreeGoalNode;
  depth: number;
  subtreeSize: number;
  areaId: string;
}): GoalVisualAuthoritySpec {
  const goalSignificance01 = deriveGoalSignificance01(args);
  return {
    goalSignificance01,
    authorityMul: authorityMulFromSignificance(goalSignificance01),
  };
}

/**
 * Render hooks — all centered at neutral significance (~0.5) ≈ multiplier 1.0.
 * High significance: tighter fields, denser cores, stronger chords — not bigger fog.
 */
export type GoalAuthorityRenderFactors = {
  /** Multiply coherence ellipse rx/ry — &lt;1 = tighter envelope for high significance. */
  coherenceEnvelopeMul: number;
  /** Multiply field fill opacities — &gt;1 = denser luminous pressure. */
  coherenceDensityMul: number;
  /** Multiply nominal orbital / corolla circumradius. */
  orbitalSpreadMul: number;
  /** Extra closure on petal form feel (baked into bloom spec via multiplier). */
  petalAuthorityMul: number;
  membraneFillAuthorityMul: number;
  membranePullAuthorityMul: number;
  arcChordAuthorityMul: number;
  hubJewelAuthorityMul: number;
  undershapeAuthorityMul: number;
  wholeNodeCoreAuthorityMul: number;
  wholeNodeRingAuthorityMul: number;
  branchVitalityAuthorityMul: number;
  branchAttachOpacityAuthorityMul: number;
  labelFontSizeMul: number;
  organismRingStrokeMul: number;
  /** Tiny hotspots / junctions — higher significance = brighter compressed pins. */
  materialHotspotMul: number;
  /** Inner field + petal core luminosity — pressure, not spread. */
  luminousInnerPressureMul: number;
  /** Multiply outer atmospheric veil opacity — high sig reduces diffuse haze. */
  veilAttenuationMul: number;
  /** Multiply radial gradient r% — smaller = steeper falloff, more contained radiance. */
  fieldRadialTightnessMul: number;
  /** Membrane creases / crossings — emotional energy nodes. */
  junctionEmphasisMul: number;
  /** Violet shadow pockets + mid-band separation on petals. */
  petalMaterialDepthMul: number;
};

export function authorityRenderFactors(authorityMul: number): GoalAuthorityRenderFactors {
  const u = clamp01((authorityMul - GOAL_AUTHORITY_MUL_MIN) / (GOAL_AUTHORITY_MUL_MAX - GOAL_AUTHORITY_MUL_MIN));
  const lerp = (a: number, b: number) => a + (b - a) * u;
  return {
    coherenceEnvelopeMul: lerp(1.06, 0.88),
    coherenceDensityMul: lerp(0.94, 1.22),
    orbitalSpreadMul: lerp(0.96, 1.12),
    petalAuthorityMul: lerp(0.97, 1.1),
    membraneFillAuthorityMul: lerp(0.94, 1.18),
    membranePullAuthorityMul: lerp(0.98, 1.14),
    arcChordAuthorityMul: lerp(0.93, 1.2),
    hubJewelAuthorityMul: lerp(0.9, 1.22),
    undershapeAuthorityMul: lerp(0.93, 1.16),
    wholeNodeCoreAuthorityMul: lerp(0.9, 1.26),
    wholeNodeRingAuthorityMul: lerp(0.9, 1.2),
    branchVitalityAuthorityMul: lerp(0.88, 1.28),
    branchAttachOpacityAuthorityMul: lerp(0.9, 1.18),
    labelFontSizeMul: lerp(0.97, 1.055),
    organismRingStrokeMul: lerp(0.93, 1.16),
    materialHotspotMul: lerp(0.86, 1.48),
    luminousInnerPressureMul: lerp(0.92, 1.34),
    veilAttenuationMul: lerp(1.04, 0.52),
    fieldRadialTightnessMul: lerp(1.06, 0.72),
    junctionEmphasisMul: lerp(0.9, 1.42),
    petalMaterialDepthMul: lerp(0.92, 1.28),
  };
}
