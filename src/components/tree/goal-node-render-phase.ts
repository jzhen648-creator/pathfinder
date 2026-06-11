/**
 * Milestone-driven **visual** state for tree goal nodes.
 * Purely derived for rendering — does not replace persisted {@link GoalBloomStatus}.
 *
 * Consumed by:
 *  - `tree-goal-visual.tsx` (core circle + inner glow + outer halo)
 *  - `tree-render-goals-subtree.tsx` (orbital dots + selection halo)
 */

import type { GoalBloomStatus, TreeOrbitalMilestone } from "./tree-types";

/** Orbital ring radius hint used by limb backdrop hull bounds. */
export const TREE_GOAL_ORBITAL_CRISP_RADIUS_PX = 18;

export type GoalNodeVisualPhase = "ON_HOLD" | "COMPLETE" | "ACTIVE";

export type GoalNodeRenderIntensities = {
  /** Tiny base boost to core glyph alpha (kept for compatibility with goal-visual sizing logic). */
  coreGlyphOpacityBoost: number;
  /** 0..1 — drives the inner radial-gradient glow inside the core circle. */
  coreGlowOpacity01: number;
  /** 0..1 — bloomed-only outer halo opacity; max ≈ progress01 * 0.15. */
  outerHaloOpacity01: number;
};

export type GoalNodeDerivedRenderState = {
  progress01: number;
  visualPhase: GoalNodeVisualPhase;
  intensities: GoalNodeRenderIntensities;
  visibleOrbitalCount: number;
  completedOrbitalCount: number;
};

/** Status-driven glow when a goal has no milestone data (count === 0). */
function noMilestonesCoreGlow(status: GoalBloomStatus): number {
  switch (status) {
    case "COMPLETE":
      return 1;
    case "ACTIVE":
      return 0.48;
    case "PAUSED":
    case "ABANDONED":
      return 0.08;
    default:
      return 0.22;
  }
}

export function deriveGoalNodeRenderState(args: {
  bloomStatus: GoalBloomStatus;
  orbitalMilestones: TreeOrbitalMilestone[];
}): GoalNodeDerivedRenderState {
  const visibleCount = args.orbitalMilestones.length;
  const completedCount = args.orbitalMilestones.filter((m) => m.completed).length;
  const progress01 = visibleCount === 0 ? 0 : completedCount / visibleCount;

  let visualPhase: GoalNodeVisualPhase;
  if (args.bloomStatus === "PAUSED" || args.bloomStatus === "ABANDONED") {
    visualPhase = "ON_HOLD";
  } else if (args.bloomStatus === "COMPLETE") {
    visualPhase = "COMPLETE";
  } else if (visibleCount > 0 && completedCount === visibleCount) {
    /* Fully completed projection while lifecycle catches up — read as coherent bloom. */
    visualPhase = "COMPLETE";
  } else if (visibleCount === 0) {
    visualPhase = "ACTIVE";
  } else if (completedCount === 0) {
    visualPhase = "ACTIVE";
  } else {
    visualPhase = "ACTIVE";
  }

  /** Phase multiplier on top of progress01 — keeps zero-glow-at-0% with milestones, lifts bloomed. */
  const phaseGlowMul =
    visualPhase === "ON_HOLD"
      ? 0.38
      : visualPhase === "ACTIVE"
        ? visibleCount > 0 && completedCount > 0 && completedCount < visibleCount
          ? 1.08 + progress01 * 0.22
          : 0.72
        : 1.28;

  let coreGlowOpacity01: number;
  if (visibleCount === 0) {
    coreGlowOpacity01 = noMilestonesCoreGlow(args.bloomStatus);
  } else {
    /* With milestones: progress01 drives glow; keep a readable ignition read at first completion. */
    const raw = progress01 * phaseGlowMul;
    coreGlowOpacity01 =
      completedCount > 0
        ? Math.min(1, Math.max(0.34, raw))
        : Math.min(0.58, raw * 0.78);
  }

  const outerHaloOpacity01 =
    visualPhase === "COMPLETE"
      ? Math.min(0.4, (visibleCount === 0 ? 1 : progress01) * 0.36)
      : 0;

  /** Modest base lift to keep the core glyph crisp across phases without re-introducing chromatic stacks. */
  let coreGlyphOpacityBoost = 0;
  if (visualPhase !== "ON_HOLD") {
    if (visualPhase === "COMPLETE") {
      coreGlyphOpacityBoost = 0.05 + progress01 * 0.04;
    } else if (visualPhase === "ACTIVE") {
      coreGlyphOpacityBoost = progress01 * 0.08;
    }
  }

  return {
    progress01,
    visualPhase,
    visibleOrbitalCount: visibleCount,
    completedOrbitalCount: completedCount,
    intensities: {
      coreGlyphOpacityBoost,
      coreGlowOpacity01,
      outerHaloOpacity01,
    },
  };
}
