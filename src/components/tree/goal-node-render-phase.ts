/**
 * Milestone-driven **visual** state for tree goal nodes (hex orbitals).
 * Purely derived for rendering — does not replace persisted {@link GoalBloomStatus}.
 *
 * Composed SVG layers (petals, membranes, arcs) consume {@link deriveBloomRenderSpec} in `bloom-render-spec.ts`.
 *
 * Motion roadmap: pulse coreGlyphOpacityBoost / chord opacity on a long period; dash-offset on hex
 * scaffold — keep amplitudes tiny so the tree feels alive, not celebratory.
 */

import { TREE_ORBITAL_MAX_VISIBLE } from "./milestone-tree-projection";
import type { GoalBloomStatus, TreeOrbitalMilestone } from "./tree-types";

/** Crisp orbital disk radius in user units (`tree-render-goals-subtree`). */
export const TREE_GOAL_ORBITAL_CRISP_RADIUS_PX = 18;

export type GoalNodeVisualPhase = "ended" | "bloomed" | "bud" | "growing";

export type GoalOrbitalGlowLayer = { radiusPx: number; fillOpacity: number };

export type GoalNodeRenderIntensities = {
  /** Multiplier for default incomplete orbital ring stroke opacity (1 = unchanged). */
  incompleteOrbitalStrokeOpacityScale: number;
  /** Drawn behind crisp milestone disks, largest radius first. Keep opacities very low. */
  orbitalCompletedGlowLayers: readonly GoalOrbitalGlowLayer[];
  /** Added to hex branch-glyph opacity where milestone vitality applies. */
  coreGlyphOpacityBoost: number;
};

export type GoalNodeDerivedRenderState = {
  progress01: number;
  visualPhase: GoalNodeVisualPhase;
  intensities: GoalNodeRenderIntensities;
  visibleOrbitalCount: number;
  completedOrbitalCount: number;
};

export function deriveGoalNodeRenderState(args: {
  bloomStatus: GoalBloomStatus;
  orbitalMilestones: TreeOrbitalMilestone[];
}): GoalNodeDerivedRenderState {
  const visible = args.orbitalMilestones.slice(0, TREE_ORBITAL_MAX_VISIBLE);
  const visibleCount = visible.length;
  const completedCount = visible.filter((m) => m.completed).length;
  const progress01 = visibleCount === 0 ? 0 : completedCount / visibleCount;

  let visualPhase: GoalNodeVisualPhase;

  if (args.bloomStatus === "ENDED") {
    visualPhase = "ended";
  } else if (args.bloomStatus === "BLOOMED") {
    visualPhase = "bloomed";
  } else if (visibleCount > 0 && completedCount === visibleCount) {
    /* Fully completed projection while lifecycle catches up — read as coherent bloom. */
    visualPhase = "bloomed";
  } else if (visibleCount === 0) {
    visualPhase = args.bloomStatus === "BUD" ? "bud" : "growing";
  } else if (completedCount === 0) {
    visualPhase = "bud";
  } else {
    /* Partial completion: continuum of coherence inside GROWING (no separate “harmonizing”). */
    visualPhase = "growing";
  }

  const incompleteOrbitalStrokeOpacityScale =
    visualPhase === "ended"
      ? 0.72
      : visualPhase === "bud"
        ? 0.74
        : visualPhase === "growing"
          ? 0.94 + progress01 * 0.07
          : 1.02;

  const phaseGlowMul =
    visualPhase === "ended"
      ? 0.2
      : visualPhase === "bud"
        ? 0.48
        : visualPhase === "growing"
          ? 0.92 + progress01 * 0.18
          : 1.2 + progress01 * 0.09;

  const t = progress01;
  const outerOp = Math.min(0.112, (0.036 + t * 0.034) * phaseGlowMul);
  const midOp = Math.min(0.128, (0.052 + t * 0.042) * phaseGlowMul);
  const deepOp = Math.min(0.068, (0.022 + t * 0.026) * phaseGlowMul);

  const r0 = TREE_GOAL_ORBITAL_CRISP_RADIUS_PX;
  /** BUD: compact two-stack only; emerging phases get deep→mid luminosity hierarchy. */
  const orbitalCompletedGlowLayers: GoalOrbitalGlowLayer[] =
    visualPhase === "bud" || visualPhase === "ended"
      ? [
          { radiusPx: r0 * 1.36, fillOpacity: outerOp },
          { radiusPx: r0 * 1.14, fillOpacity: midOp },
        ]
      : [
          { radiusPx: r0 * 1.78, fillOpacity: deepOp },
          { radiusPx: r0 * 1.48, fillOpacity: outerOp },
          { radiusPx: r0 * 1.2, fillOpacity: midOp },
        ];

  let coreGlyphOpacityBoost = 0;
  if (visualPhase !== "ended" && visibleCount > 0) {
    if (visualPhase === "bloomed") {
      coreGlyphOpacityBoost = 0.05 + t * 0.042;
    } else if (visualPhase === "bud") {
      coreGlyphOpacityBoost = t * 0.028;
    } else {
      coreGlyphOpacityBoost = t * 0.098;
    }
  }

  return {
    progress01,
    visualPhase,
    visibleOrbitalCount: visibleCount,
    completedOrbitalCount: completedCount,
    intensities: {
      incompleteOrbitalStrokeOpacityScale,
      orbitalCompletedGlowLayers,
      coreGlyphOpacityBoost,
    },
  };
}

/** Adjacent milestone indices on the hex ring (same slot ordering as render). */
export function orbitalHexCompletedChordPairs(
  visible: readonly { completed: boolean }[],
): ReadonlyArray<readonly [number, number]> {
  const n = visible.length;
  const pairs: [number, number][] = [];
  for (let i = 0; i < n - 1; i += 1) {
    if (visible[i]!.completed && visible[i + 1]!.completed) pairs.push([i, i + 1]);
  }
  if (n === 6 && visible[0]!.completed && visible[5]!.completed) pairs.push([5, 0]);
  return pairs;
}

/**
 * Slightly lifts completed glow when a neighbor on the hex is also complete —
 * shared balance, not brighter decorative bloom.
 */
export function orbitalGlowAdjacencyMultiplier(
  visible: readonly { completed: boolean }[],
  index: number,
): number {
  const n = visible.length;
  if (n === 0) return 1;
  let adj = 0;
  if (index > 0 && visible[index - 1]!.completed) adj += 1;
  if (index < n - 1 && visible[index + 1]!.completed) adj += 1;
  if (n === 6) {
    if (index === 0 && visible[5]!.completed) adj += 1;
    if (index === 5 && visible[0]!.completed) adj += 1;
  }
  return 1 + Math.min(0.052, adj * 0.024);
}

/** Quadratic chord between hex vertices; control pulls slightly outward from goal center for faint tension. */
export function orbitalHexChordQuadControl(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  goalCx: number,
  goalCy: number,
  bulgePx: number,
): { qx: number; qy: number } {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = mx - goalCx;
  const dy = my - goalCy;
  const len = Math.hypot(dx, dy) || 1;
  return {
    qx: mx + (dx / len) * bulgePx,
    qy: my + (dy / len) * bulgePx,
  };
}

export function coherenceChordStrokeStyle(
  visualPhase: GoalNodeVisualPhase,
  progress01: number,
): { opacity: number; strokeWidthPx: number } {
  if (visualPhase === "ended") {
    return { opacity: 0.014, strokeWidthPx: 0.34 };
  }
  const base =
    visualPhase === "bud"
      ? 0.014
      : visualPhase === "growing"
        ? 0.032 + progress01 * 0.012
        : 0.042;
  const boost = progress01 * (visualPhase === "bloomed" ? 0.022 : 0.016);
  const bloomedCap = progress01 >= 0.985 ? 0.092 : 0.082;
  return {
    opacity: Math.min(visualPhase === "bloomed" ? bloomedCap : 0.068, base + boost),
    strokeWidthPx:
      visualPhase === "bud"
        ? 0.36
        : visualPhase === "bloomed"
          ? progress01 >= 0.985
            ? 0.58
            : 0.54
          : 0.46,
  };
}

/** Ember at hex child-attach (branch-out); keep barely visible. */
export function branchAttachVitalityFillOpacity(
  visualPhase: GoalNodeVisualPhase,
  progress01: number,
): number {
  if (visualPhase === "ended") return 0;
  if (visualPhase === "bud") return Math.min(0.038, 0.008 + progress01 * 0.022);
  if (visualPhase === "bloomed") return Math.min(0.142, 0.038 + progress01 * 0.078);
  return Math.min(0.138, 0.036 + progress01 * 0.082);
}

/** Stable 0…1 hash for imperceptible organic variance (no runtime randomness). */
export function organicVariance01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** One elliptical coherence veil — radial gradients in SVG supply soft falloff (not a hard “glow blob”). */
export type GoalCoherenceFieldLayer = {
  fillOpacity: number;
  rx: number;
  ry: number;
  cxOffset: number;
  cyOffset: number;
};

/** Multi-scale atmospheric enclosure: outer spatial authority + inner organism binding. */
export type GoalCoherenceFieldSpec = {
  outer: GoalCoherenceFieldLayer | null;
  inner: GoalCoherenceFieldLayer | null;
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-9, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Layered environmental coherence around the goal hub (deterministic).
 * BUD = compact inner whisper; GROWING = expanding territory; BLOOMED = unified veil + inner bowl (symmetric when hex ring completes).
 */
export function deriveGoalCoherenceField(
  goalId: string,
  derived: GoalNodeDerivedRenderState,
): GoalCoherenceFieldSpec {
  const phase = derived.visualPhase;
  const v = organicVariance01(goalId);
  const w = organicVariance01(`${goalId}:atm`);
  const t = derived.progress01;
  const ox = (v - 0.5) * 9;
  const oy = (w - 0.5) * 8;

  if (phase === "ended") {
    return { outer: null, inner: null };
  }

  if (phase === "bud") {
    return {
      outer: null,
      inner: {
        fillOpacity: 0.0054 + (1 - t) * 0.0052,
        rx: 12.5 + v * 5,
        ry: 11 + w * 4,
        cxOffset: ox * 0.42,
        cyOffset: oy * 0.42,
      },
    };
  }

  if (phase === "growing") {
    const ramp = smoothstep(0.12, 0.92, t);
    const territory = t;
    const outerOp = Math.min(
      0.064,
      (0.012 + territory * 0.03 + (w - 0.5) * 0.006) * (0.42 + 0.58 * ramp),
    );
    const innerOp = Math.min(0.091, (0.028 + territory * 0.05) * (0.48 + 0.52 * ramp));
    return {
      outer:
        ramp < 0.04
          ? null
          : {
              fillOpacity: outerOp,
              rx: 48 + v * 26 + territory * 28,
              ry: 42 + w * 22 + territory * 26,
              cxOffset: ox * 0.98,
              cyOffset: oy * 0.98,
            },
      inner: {
        fillOpacity: innerOp,
        rx: 27 + v * 14 + territory * 15,
        ry: 24 + w * 11 + territory * 13,
        cxOffset: ox * 0.58,
        cyOffset: oy * 0.58,
      },
    };
  }

  /* bloomed — organism sealed to **this** goal’s milestone count (not “six slots”). */
  const nVis = derived.visibleOrbitalCount;
  const organismSealed =
    derived.completedOrbitalCount === derived.visibleOrbitalCount && derived.visibleOrbitalCount > 0;
  const sealSix = organismSealed && nVis >= 6;
  const symMul = sealSix ? 0.28 : organismSealed ? 0.38 : 1;
  const oxS = ox * symMul;
  const oyS = oy * symMul;

  const outerOp = Math.min(sealSix ? 0.086 : organismSealed ? 0.08 : 0.074, 0.03 + t * 0.042 + (w - 0.5) * 0.006);
  const innerOp = Math.min(sealSix ? 0.138 : organismSealed ? 0.126 : 0.118, 0.052 + t * 0.06);

  const nTight = Math.max(1, nVis) / 6;
  let rxOut = (58 + v * 24 + t * 12) * (0.82 + nTight * 0.18);
  let ryOut = (52 + w * 20 + t * 10) * (0.82 + nTight * 0.18);
  if (sealSix) {
    const avg = (rxOut + ryOut) / 2;
    rxOut = avg + (rxOut - avg) * 0.56;
    ryOut = avg + (ryOut - avg) * 0.56;
  } else if (organismSealed) {
    const blend = 0.62 + nTight * 0.18;
    const avg = (rxOut + ryOut) / 2;
    rxOut = avg + (rxOut - avg) * blend;
    ryOut = avg + (ryOut - avg) * blend;
  }

  let rxIn = (30 + v * 12 + t * 7) * (0.84 + nTight * 0.16);
  let ryIn = (28 + w * 10 + t * 5) * (0.84 + nTight * 0.16);
  if (sealSix) {
    const avgIn = (rxIn + ryIn) / 2;
    rxIn = avgIn + (rxIn - avgIn) * 0.62;
    ryIn = avgIn + (ryIn - avgIn) * 0.62;
  } else if (organismSealed) {
    const blendIn = 0.68 + nTight * 0.14;
    const avgIn = (rxIn + ryIn) / 2;
    rxIn = avgIn + (rxIn - avgIn) * blendIn;
    ryIn = avgIn + (ryIn - avgIn) * blendIn;
  }

  return {
    outer: {
      fillOpacity: outerOp,
      rx: rxOut,
      ry: ryOut,
      cxOffset: oxS * 1.02,
      cyOffset: oyS * 0.98,
    },
    inner: {
      fillOpacity: innerOp,
      rx: rxIn,
      ry: ryIn,
      cxOffset: oxS * 0.46,
      cyOffset: oyS * 0.46,
    },
  };
}

/** Catalog segment immediately feeding the goal — tiny opacity lift only. */
export type GoalBranchVitalityStroke = {
  opacityBoost: number;
  deltaT: number;
};

export function deriveGoalBranchVitalityStroke(
  goalId: string,
  derived: GoalNodeDerivedRenderState,
): GoalBranchVitalityStroke | null {
  const phase = derived.visualPhase;
  const v = organicVariance01(`${goalId}:feed`);
  const t = derived.progress01;

  if (phase === "ended" || phase === "bud") return null;

  if (phase === "growing") {
    if (derived.completedOrbitalCount === 0) return null;
    const gb = t;
    const boostEarly = 0.008 + v * 0.014 + t * 0.022;
    const boostLate = 0.028 + v * 0.024 + t * 0.02;
    const deltaEarly = 0.034 + v * 0.026 + t * 0.036;
    const deltaLate = 0.058 + v * 0.038 + t * 0.042;
    return {
      opacityBoost: boostEarly + (boostLate - boostEarly) * gb,
      deltaT: deltaEarly + (deltaLate - deltaEarly) * gb,
    };
  }

  if (phase === "bloomed") {
    return {
      opacityBoost: 0.032 + v * 0.022 + t * 0.016,
      deltaT: 0.078 + v * 0.048 + t * 0.038,
    };
  }

  return null;
}

export function organicChordOpacityFactor(goalId: string, ia: number, ib: number): number {
  const r = organicVariance01(`${goalId}:chord:${ia}:${ib}`);
  return 0.87 + r * 0.26;
}

export function organicChordBulgePx(goalId: string, ia: number, ib: number): number {
  const r = organicVariance01(`${goalId}:bulge:${ia}:${ib}`);
  return 2.65 + (r - 0.5) * 0.62;
}

export function organicOrbitalGlowVariation(
  goalId: string,
  milestoneIndex: number,
  layerIndex: number,
): { radiusMul: number; opacityMul: number } {
  const rv = organicVariance01(`${goalId}:og:r:${milestoneIndex}:${layerIndex}`);
  const ov = organicVariance01(`${goalId}:og:o:${milestoneIndex}:${layerIndex}`);
  return {
    radiusMul: 1 + (rv - 0.5) * 0.064,
    opacityMul: 0.93 + ov * 0.13,
  };
}
