/**
 * Phase 1 bloom render pipeline: milestone-driven SVG layers derived from stabilized semantics.
 * Geometry-first: teardrop petals, hex coherence, adjacency membranes — minimal diffuse glow.
 *
 * Future motion (design hooks only): breathe hex-dash offset / membrane fill; sub-pixel axial
 * gradient drift on petals; low-frequency vitality on branch-attach and chord strokes — slow,
 * organic, never arcade or particle-heavy.
 */

import {
  branchAttachVitalityFillOpacity,
  coherenceChordStrokeStyle,
  deriveGoalNodeRenderState,
  orbitalGlowAdjacencyMultiplier,
  orbitalHexChordQuadControl,
  orbitalHexCompletedChordPairs,
  organicChordBulgePx,
  organicChordOpacityFactor,
  organicOrbitalGlowVariation,
  organicVariance01,
  TREE_GOAL_ORBITAL_CRISP_RADIUS_PX,
  type GoalNodeDerivedRenderState,
  type GoalNodeVisualPhase,
} from "./goal-node-render-phase";
import { TREE_ORBITAL_MAX_VISIBLE } from "./milestone-tree-projection";
import { orbitalBranchAttachSlotIndex } from "./tree-orbital-layout";
import type { GoalBloomStatus, TreeOrbitalMilestone } from "./tree-types";
import {
  clampBloomOpacity,
  TREE_RENDER_QUALITY_FACTORS,
  type TreeRenderQualityFactors,
} from "./tree-render-quality";
import {
  JEWEL_CORE_HOT_HEX,
  JEWEL_CORE_PINK_HEX,
  limbJewelHighlightStopColor,
} from "./tree-color-accents";
import {
  NEUTRAL_GOAL_VISUAL_AUTHORITY,
  authorityRenderFactors,
  type GoalAuthorityRenderFactors,
  type GoalVisualAuthoritySpec,
} from "./goal-visual-authority";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-9, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export type BloomOrbitalGlowLayerSpec = {
  radiusPx: number;
  fillOpacity: number;
  radiusMul: number;
  opacityMul: number;
};

/** Whole-node lift: core stabilizes + hex reads as one organism (behind glyph). */
export type BloomWholeNodeCoherence = {
  coreOpacityAdd: number;
  hexRingOpacity: number;
  hexRingWidthPx: number;
  /**
   * Hex scaffold stroke dash — keeps the boundary implied / fragmenting as bloom coheres.
   * Solid stroke when empty (edge cases only).
   */
  hexRingDasharray: string;
};

/** Completed milestone: structural teardrop grown from hex vertex toward outside. */
export type BloomOrbitalSlotSpec = {
  milestoneId: string;
  title: string;
  vertexIndex: number;
  completed: boolean;
  vertex: { x: number; y: number };
  petalForm01: number;
  /** Closed path in snapped space; null when incomplete. */
  petalPathD: string | null;
  /**
   * Axial fill axis (inner stem → tip): ties petal read to core direction without extra glow.
   * `userSpaceOnUse` linear gradient id `{defPrefix}-petalSurf-{vertexIndex}`.
   */
  petalAxialGradient: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Thin inward curve from petal stem toward hub — structural “feed”, not bloom glow. */
  petalFeedPathD: string | null;
  petalFeedStrokeOpacity: number;
  /** Largest-radius petal-adjacent veil (deepest glow template layer) — spatial “inner organism”. */
  undershapeGlowFar: BloomOrbitalGlowLayerSpec | null;
  /** Mid-radius accent behind completed petal surface. */
  undershapeGlow: BloomOrbitalGlowLayerSpec | null;
  /** Inner petal stem / hub-ward pinch — tiny hot read (not a large glow). */
  petalStemJewel: BloomLuminousJewelSpec | null;
  /** Hub-adjacent petal convergence — compressed junction pin (under petal fill). */
  petalJunctionHotspot: BloomLuminousJewelSpec | null;
  incompleteRingStrokeOpacity: number;
  incompleteRingDasharray: string;
  incompleteRingRadius: number;
  incompleteRingStrokeWidthPx: number;
};

export type BloomMembraneSpec = {
  ia: number;
  ib: number;
  d: string;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWidthPx: number;
};

/** Concentrated luminous pin (small radius, high local contrast). */
export type BloomLuminousJewelSpec = {
  cx: number;
  cy: number;
  rPx: number;
  fill: string;
  fillOpacity: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidthPx?: number;
};

export type BloomAdjacencyArcSpec = {
  ia: number;
  ib: number;
  d: string;
  strokeOpacity: number;
  strokeWidthPx: number;
};

/** Lower-attach → hub: structural continuity with the branch (no fill/glow). */
export type BloomBranchSpineSpec = {
  pathD: string;
  strokeOpacity: number;
};

export type BloomRenderSpec = {
  goalId: string;
  defPrefix: string;
  derived: GoalNodeDerivedRenderState;
  wholeNode: BloomWholeNodeCoherence;
  membranes: readonly BloomMembraneSpec[];
  arcs: readonly BloomAdjacencyArcSpec[];
  slots: readonly BloomOrbitalSlotSpec[];
  branchAttachFillOpacity: number;
  /** Reads as sap-flow into the organism from the hex child-attach (vertex 3). */
  branchSpine: BloomBranchSpineSpec | null;
  /** Soft + hot stacked discs at hub (drawn under central glyph, over branch spine). */
  hubJewelLayers: readonly BloomLuminousJewelSpec[];
  /** Crease highlights at membrane inward “mouth” toward hub. */
  membraneJewels: readonly BloomLuminousJewelSpec[];
  /** Branch ↔ organism entry — tiny focal point along attach spine. */
  branchConvergenceHotspot: BloomLuminousJewelSpec | null;
  /** Render-only life-importance (distinct from bloom lifecycle). */
  visualAuthority: GoalVisualAuthoritySpec;
};

export function bloomSpecDefPrefix(goalId: string): string {
  const safe = goalId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `bloom-${safe}`;
}

export function applyTreeRenderQualityToDerived(
  derived: GoalNodeDerivedRenderState,
  q: TreeRenderQualityFactors,
): GoalNodeDerivedRenderState {
  return {
    ...derived,
    intensities: {
      ...derived.intensities,
      coreGlyphOpacityBoost: derived.intensities.coreGlyphOpacityBoost * q.coreJewelMul,
      orbitalCompletedGlowLayers: derived.intensities.orbitalCompletedGlowLayers.map((layer) => ({
        ...layer,
        fillOpacity: clampBloomOpacity(layer.fillOpacity * q.orbitalGlowMul, 0.2),
      })),
      incompleteOrbitalStrokeOpacityScale: Math.min(
        1.14,
        derived.intensities.incompleteOrbitalStrokeOpacityScale * q.incompleteRingOpacityMul,
      ),
    },
  };
}

export function applyTreeRenderQualityToWholeNode(
  whole: BloomWholeNodeCoherence,
  q: TreeRenderQualityFactors,
): BloomWholeNodeCoherence {
  return {
    coreOpacityAdd: clampBloomOpacity(whole.coreOpacityAdd * q.coreJewelMul, 0.22),
    hexRingOpacity: clampBloomOpacity(whole.hexRingOpacity * (0.9 + q.coreJewelMul * 0.1), 0.145),
    hexRingWidthPx: Math.min(0.55, whole.hexRingWidthPx * (0.96 + q.coreJewelMul * 0.04)),
    hexRingDasharray: whole.hexRingDasharray,
  };
}

/** Incomplete-slot rings: phase-readable at distance (dash rhythm, scale) without louder color. */
function incompleteOrbitalRingGeometry(
  phase: GoalNodeVisualPhase,
  mi: number,
  n: number,
  goalId: string,
  progress01: number,
): { dash: string; r: number; sw: number; opacityMul: number } {
  const v = organicVariance01(`${goalId}:inc:${mi}`);
  const gb = progress01;
  if (phase === "ended") {
    return { dash: `2.6 ${9 + v * 2.5}`, r: 5.05, sw: 0.54, opacityMul: 0.62 };
  }
  if (phase === "bud") {
    return {
      dash: `1.6 ${15 + v * 4.5}`,
      r: 4.92,
      sw: 0.52,
      opacityMul: 0.52,
    };
  }
  if (phase === "growing") {
    const daEarly = 3.2 + (mi % 3) * 0.85 + v * 0.45;
    const dbEarly = 6.5 + ((mi + 2) % 4) * 1.05 + v * 1.4;
    const daLate = 5.2;
    const dbLate = 6.4 + v * 0.6;
    const da = lerp(daEarly, daLate, gb);
    const db = lerp(dbEarly, dbLate, gb);
    return {
      dash: `${da.toFixed(2)} ${db.toFixed(2)}`,
      r: lerp(5.42, 5.58, gb),
      sw: lerp(0.69, 0.76, gb),
      opacityMul: lerp(0.9, 0.96, gb),
    };
  }
  if (phase === "bloomed") {
    return { dash: `5 ${6.8 + v * 0.5}`, r: 5.52, sw: 0.71, opacityMul: 0.88 };
  }
  return { dash: "4 5.5", r: 5.5, sw: 0.72, opacityMul: 1 };
}

/** Pulls petal tips sideways toward the open hemisphere — growing-only asymmetry. */
function growingPetalLateralTipPx(
  goalId: string,
  visible: readonly { completed: boolean }[],
  mi: number,
  scale: number,
  progress01: number,
): number {
  const n = visible.length;
  if (n < 3) return 0;
  const ang = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / n;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  let nc = 0;
  let nu = 0;
  for (let i = 0; i < n; i++) {
    const th = ang(i);
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    if (visible[i]!.completed) {
      sx += cx;
      sy += cy;
      nc++;
    } else {
      ox += cx;
      oy += cy;
      nu++;
    }
  }
  if (nc === 0 || nu === 0) return 0;
  const vc = Math.hypot(sx, sy) || 1;
  const vo = Math.hypot(ox, oy) || 1;
  const bx = ox / vo - sx / vc;
  const by = oy / vo - sy / vc;
  const bl = Math.hypot(bx, by) || 1;
  const thM = ang(mi);
  const ux = Math.cos(thM);
  const uy = Math.sin(thM);
  const wx = -uy;
  const wy = ux;
  const lateral = (wx * bx + wy * by) / bl;
  const jitter = (organicVariance01(`${goalId}:lat:${mi}`) - 0.5) * 0.28;
  const raw = scale * Math.max(-1, Math.min(1, lateral * 0.55 + jitter)) * 0.88;
  const asymFade = 1 - smoothstep(0.42, 0.92, progress01);
  return raw * asymFade;
}

function growingAdjacentCompletionBias01(visible: readonly { completed: boolean }[], mi: number): number {
  const n = visible.length;
  if (n < 2) return 0;
  let w = 0;
  for (let k = -1; k <= 1; k++) {
    const j = (((mi + k) % n) + n) % n;
    if (visible[j]!.completed) w += 1 - Math.abs(k) * 0.28;
  }
  return w / 3 - 0.39;
}

function adjCompletedNeighbors(visible: readonly { completed: boolean }[], index: number): number {
  const n = visible.length;
  let c = 0;
  if (index > 0 && visible[index - 1]!.completed) c += 1;
  if (index < n - 1 && visible[index + 1]!.completed) c += 1;
  if (n === 6) {
    if (index === 0 && visible[5]!.completed) c += 1;
    if (index === 5 && visible[0]!.completed) c += 1;
  }
  return c;
}

type TeardropPetalGeom = {
  pathD: string;
  innerStem: { x: number; y: number };
  tip: { x: number; y: number };
};

/**
 * Teardrop with explicit inward apex: grown from hub direction, not parked at the vertex.
 * Outer lens unchanged; stem pinches deeper toward core with a radial keel.
 */
function teardropPetalGeometry(
  vx: number,
  vy: number,
  gx: number,
  gy: number,
  form01: number,
  adjNeighbors: number,
  snap: (n: number) => number,
  lateralTipPx = 0,
): TeardropPetalGeom {
  const dx = vx - gx;
  const dy = vy - gy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const wx = -uy;
  const wy = ux;

  const base = TREE_GOAL_ORBITAL_CRISP_RADIUS_PX;
  const cohesion = 1 + Math.min(0.14, adjNeighbors * 0.065);

  const stemDepth = base * (0.46 + 0.22 * (1 - form01));
  const stemHalfW = (base * Math.max(0.15, 0.52 - 0.46 * form01)) / cohesion;
  const keelDepth = (base * (0.24 + 0.15 * form01)) / Math.sqrt(cohesion);

  const tipLen = base * (0.48 + 0.72 * form01);
  const shoulder = base * (0.36 + 0.26 * form01) * cohesion;
  const midPull = base * (0.22 + 0.2 * form01);

  const baseLx = vx - ux * stemDepth + wx * stemHalfW;
  const baseLy = vy - uy * stemDepth + wy * stemHalfW;
  const baseRx = vx - ux * stemDepth - wx * stemHalfW;
  const baseRy = vy - uy * stemDepth - wy * stemHalfW;

  let innerMx = vx - ux * (stemDepth + keelDepth);
  let innerMy = vy - uy * (stemDepth + keelDepth);

  const tipX = vx + ux * tipLen + wx * lateralTipPx;
  const tipY = vy + uy * tipLen + wy * lateralTipPx;

  const latNudge = lateralTipPx * 0.2;
  const cLx = vx + wx * shoulder + ux * midPull + wx * latNudge;
  const cLy = vy + wy * shoulder + uy * midPull + wy * latNudge;
  const cRx = vx - wx * shoulder + ux * midPull + wx * latNudge;
  const cRy = vy - wy * shoulder + uy * midPull + wy * latNudge;

  const minDistFromCore = 13.2;
  const rdx = innerMx - gx;
  const rdy = innerMy - gy;
  const rd = Math.hypot(rdx, rdy) || 1;
  if (rd < minDistFromCore) {
    const s = minDistFromCore / rd;
    innerMx = gx + rdx * s;
    innerMy = gy + rdy * s;
  }

  const pathD = [
    `M ${snap(innerMx)} ${snap(innerMy)}`,
    `L ${snap(baseLx)} ${snap(baseLy)}`,
    `Q ${snap(cLx)} ${snap(cLy)} ${snap(tipX)} ${snap(tipY)}`,
    `Q ${snap(cRx)} ${snap(cRy)} ${snap(baseRx)} ${snap(baseRy)}`,
    `Z`,
  ].join(" ");

  return {
    pathD,
    innerStem: { x: snap(innerMx), y: snap(innerMy) },
    tip: { x: snap(tipX), y: snap(tipY) },
  };
}

/** Subtle quadratic toward hub — stops short of the glyph; reads as tension, not decoration. */
function petalFeedCurvePathD(
  innerStem: { x: number; y: number },
  gx: number,
  gy: number,
  snap: (n: number) => number,
): string {
  /* Drawn behind the core glyph in the subtree — may carry farther toward the hub without crossing on top. */
  const stopT = 0.48;
  const ex = innerStem.x + (gx - innerStem.x) * stopT;
  const ey = innerStem.y + (gy - innerStem.y) * stopT;
  let rdx = gx - innerStem.x;
  let rdy = gy - innerStem.y;
  const rl = Math.hypot(rdx, rdy) || 1;
  rdx /= rl;
  rdy /= rl;
  const tangX = -rdy;
  const tangY = rdx;
  const bend = 1.05;
  const cx = (innerStem.x + ex) * 0.5 + tangX * bend;
  const cy = (innerStem.y + ey) * 0.5 + tangY * bend;
  return `M ${snap(innerStem.x)} ${snap(innerStem.y)} Q ${snap(cx)} ${snap(cy)} ${snap(ex)} ${snap(ey)}`;
}

/** Branch-side inward curve (attach → hub): shared curvature language with petal feeds. */
function branchSpineCurvePathD(
  ax: number,
  ay: number,
  gx: number,
  gy: number,
  snap: (n: number) => number,
): string {
  const stopT = 0.43;
  const ex = ax + (gx - ax) * stopT;
  const ey = ay + (gy - ay) * stopT;
  let rdx = gx - ax;
  let rdy = gy - ay;
  const rl = Math.hypot(rdx, rdy) || 1;
  rdx /= rl;
  rdy /= rl;
  const tangX = -rdy;
  const tangY = rdx;
  const bend = 0.92;
  const cx = (ax + ex) * 0.5 + tangX * bend;
  const cy = (ay + ey) * 0.5 + tangY * bend;
  return `M ${snap(ax)} ${snap(ay)} Q ${snap(cx)} ${snap(cy)} ${snap(ex)} ${snap(ey)}`;
}

function branchSpineForPhase(
  phase: GoalNodeVisualPhase,
  progress01: number,
  attach: { x: number; y: number },
  gx: number,
  gy: number,
  snap: (n: number) => number,
): BloomBranchSpineSpec | null {
  if (phase === "ended" || phase === "bud") return null;
  let strokeOpacity =
    phase === "bloomed"
      ? 0.048 + progress01 * 0.022
      : lerp(0.032 + progress01 * 0.014, 0.05 + progress01 * 0.018, progress01);
  strokeOpacity = Math.min(0.084, strokeOpacity);
  return {
    pathD: branchSpineCurvePathD(attach.x, attach.y, gx, gy, snap),
    strokeOpacity,
  };
}

function petalFeedStrokeOpacityForPhase(phase: GoalNodeVisualPhase, progress01: number): number {
  if (phase === "ended") return 0.055;
  if (phase === "bloomed") return 0.086;
  if (phase === "growing") return lerp(0.118, 0.092, progress01);
  return 0;
}

function membranePathD(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  gx: number,
  gy: number,
  bulgePx: number,
  inwardPull: number,
  snap: (n: number) => number,
): string {
  const { qx, qy } = orbitalHexChordQuadControl(ax, ay, bx, by, gx, gy, bulgePx);
  const pull = inwardPull;
  const aix = ax + (gx - ax) * pull;
  const aiy = ay + (gy - ay) * pull;
  const bix = bx + (gx - bx) * pull;
  const biy = by + (gy - by) * pull;
  return [
    `M ${snap(ax)} ${snap(ay)}`,
    `Q ${snap(qx)} ${snap(qy)} ${snap(bx)} ${snap(by)}`,
    `L ${snap(bix)} ${snap(biy)}`,
    `L ${snap(aix)} ${snap(aiy)}`,
    `Z`,
  ].join(" ");
}

function membraneFillOpacityForPhase(phase: GoalNodeVisualPhase, progress01: number): number {
  if (phase === "ended" || phase === "bud") return 0;
  if (phase === "growing") {
    return lerp(0.026 + progress01 * 0.032, 0.052 + progress01 * 0.042, progress01);
  }
  return 0.064 + progress01 * 0.032;
}

function petalForm01ForCompletedSlot(
  phase: GoalNodeVisualPhase,
  progress01: number,
): number {
  if (phase === "ended") return 0;
  const base = 0.34 + progress01 * 0.5;
  const phaseBoost =
    phase === "bloomed"
      ? 0.078 + progress01 * 0.055
      : phase === "growing"
        ? lerp(0.038, 0.108, progress01)
        : 0;
  let v = Math.min(1, base + phaseBoost);
  /* BLOOMED: full teardrop closure so petals read as one flower, not isolated lobes. */
  if (phase === "bloomed") v = Math.min(1, v + (progress01 >= 0.985 ? 0.028 : 0.012));
  /* GROWING late: fuller silhouette as coherence approaches BLOOMED */
  if (phase === "growing") v = Math.min(0.94, v + progress01 * progress01 * 0.024);
  return v;
}

/** Exported for far-zoom silhouette: phase-readable hex scaffold without full bloom geometry. */
export function deriveWholeNodeCoherence(
  phase: GoalNodeVisualPhase,
  progress01: number,
  visibleCount: number,
): BloomWholeNodeCoherence {
  if (visibleCount === 0) {
    return { coreOpacityAdd: 0, hexRingOpacity: 0, hexRingWidthPx: 0, hexRingDasharray: "" };
  }

  let coreOpacityAdd = progress01 * 0.07;
  if (phase === "growing") coreOpacityAdd += progress01 * 0.032;
  if (phase === "bloomed") coreOpacityAdd = 0.118 + progress01 * 0.05;
  if (phase === "bud") coreOpacityAdd *= 0.42;
  if (phase === "ended") coreOpacityAdd *= 0.45;
  coreOpacityAdd = Math.min(phase === "bloomed" ? 0.175 : 0.118, coreOpacityAdd);

  /**
   * Hex scaffold rhythm doubles as **phase silhouette cue** at zoom:
   * bud = sparse / dormant; GROWING = early uneven → late threaded (via progress); bloomed = releases.
   */
  let hexRingOpacity: number;
  let hexRingWidthPx: number;

  if (phase === "bud") {
    hexRingOpacity = 0.018 + (1 - progress01) * 0.014;
    hexRingWidthPx = 0.32 + progress01 * 0.06;
  } else if (phase === "growing") {
    hexRingOpacity = 0.048 * (1 - progress01 * 0.38);
    const earlyOp = 0.018 + progress01 * 0.026;
    const lateOp = 0.024 * (1 - progress01 * 0.32) + progress01 * 0.022;
    hexRingOpacity += lerp(earlyOp, lateOp, progress01);
    hexRingWidthPx = 0.42 - progress01 * 0.1 + progress01 * 0.024 * (1 - progress01 * 0.42);
  } else if (phase === "bloomed") {
    hexRingOpacity = Math.min(0.138, 0.074 + progress01 * 0.054);
    hexRingWidthPx = Math.min(0.58, 0.42 + progress01 * 0.11);
  } else {
    hexRingOpacity = 0.052 * (1 - progress01 * 0.62);
    hexRingWidthPx = 0.4 - progress01 * 0.14;
  }

  if (phase === "ended") hexRingOpacity *= 0.52;
  hexRingOpacity = Math.min(0.125, Math.max(0.008, hexRingOpacity));

  if (phase !== "bud" && phase !== "growing" && phase !== "bloomed") {
    hexRingWidthPx = Math.min(0.4, Math.max(0.19, hexRingWidthPx));
  } else if (phase === "bud") {
    hexRingWidthPx = Math.min(0.42, Math.max(0.26, hexRingWidthPx));
  } else if (phase === "growing") {
    hexRingWidthPx = Math.min(0.48, Math.max(0.28, hexRingWidthPx));
  }

  let dashSolid: number;
  let dashGap: number;
  if (phase === "bud") {
    dashSolid = 1.6 + progress01 * 3.8;
    dashGap = 16 + (1 - progress01) * 10;
  } else if (phase === "growing") {
    const gb = progress01;
    const dashSolidEarly = 3.6 + (1 - progress01) * 8.5;
    const dashGapEarly = 10.5 + progress01 * 15;
    const dashSolidLate = 6.4 + (1 - progress01) * 6;
    const dashGapLate = 4.8 + progress01 * 11;
    dashSolid = lerp(dashSolidEarly, dashSolidLate, gb);
    dashGap = lerp(dashGapEarly, dashGapLate, gb);
  } else if (phase === "bloomed") {
    /* Fully unfurled: continuous hex ring silhouette (resolved organism boundary). */
    if (progress01 >= 0.985) {
      dashSolid = 400;
      dashGap = 0.01;
    } else {
      dashSolid = 4.2 + (1 - progress01) * 10;
      dashGap = 6.2 + progress01 * 22 + 4;
    }
  } else {
    dashSolid = 2.8 + (1 - progress01) * 7;
    dashGap = 12 + progress01 * 9;
  }
  const hexRingDasharray = `${dashSolid.toFixed(2)} ${dashGap.toFixed(2)}`;

  return { coreOpacityAdd, hexRingOpacity, hexRingWidthPx, hexRingDasharray };
}

function arcCoherenceWidthMul(phase: GoalNodeVisualPhase, progress01: number): number {
  if (phase === "bloomed") return (progress01 >= 0.985 ? 1.52 : 1.42) + progress01 * 0.06;
  if (phase === "growing") {
    return lerp(1.06 + progress01 * 0.14, 1.34 + progress01 * 0.12, progress01);
  }
  return 1;
}

function applyAuthorityToWholeNode(
  whole: BloomWholeNodeCoherence,
  af: GoalAuthorityRenderFactors,
): BloomWholeNodeCoherence {
  return {
    ...whole,
    coreOpacityAdd: Math.min(0.22, whole.coreOpacityAdd * af.wholeNodeCoreAuthorityMul),
    hexRingOpacity: Math.min(0.152, whole.hexRingOpacity * af.wholeNodeRingAuthorityMul),
    hexRingWidthPx: Math.min(0.62, whole.hexRingWidthPx * af.wholeNodeRingAuthorityMul),
    hexRingDasharray: whole.hexRingDasharray,
  };
}

function buildHubJewelLayers(
  snap: (n: number) => number,
  gx: number,
  gy: number,
  phase: GoalNodeVisualPhase,
  progress01: number,
  q: TreeRenderQualityFactors,
  limbTint: string,
  authorityJewelMul: number,
  innerPressureMul: number,
  hotspotMul: number,
  veilAttenuationMul: number,
): BloomLuminousJewelSpec[] {
  if (phase === "ended" || phase === "bud") return [];
  const mul = q.coreJewelMul * authorityJewelMul;
  const pressure = innerPressureMul;
  const hot = hotspotMul;
  const veil = veilAttenuationMul;
  const sx = snap(gx);
  const sy = snap(gy);
  const softFill = limbJewelHighlightStopColor(limbTint, 0.14);
  const rSoft =
    (phase === "bloomed" ? 2.95 : lerp(2.35, 2.75, progress01)) /
    (0.9 + 0.1 * pressure + 0.06 * hot);
  const opSoft = Math.min(
    0.22,
    (phase === "bloomed" ? 0.125 : lerp(0.065, 0.092, progress01)) *
      mul *
      (0.72 + 0.28 * veil),
  );
  const rPin =
    (phase === "bloomed" ? 0.92 : lerp(0.82, 0.92, progress01)) /
    (0.94 + 0.06 * hot);
  const opPin = Math.min(
    0.97,
    (phase === "bloomed" ? 0.68 : lerp(0.38, 0.52, progress01)) *
      mul *
      pressure *
      (0.91 + 0.09 * hot),
  );
  return [
    { cx: sx, cy: sy, rPx: rSoft, fill: softFill, fillOpacity: opSoft },
    {
      cx: sx,
      cy: sy,
      rPx: rPin,
      fill: JEWEL_CORE_HOT_HEX,
      fillOpacity: opPin,
      stroke: JEWEL_CORE_PINK_HEX,
      strokeOpacity: Math.min(
        0.78,
        (phase === "bloomed" ? 0.52 : 0.36) * mul * pressure * (0.88 + 0.12 * hot),
      ),
      strokeWidthPx: 0.32,
    },
  ];
}

export function deriveBloomRenderSpec(args: {
  goalId: string;
  bloomStatus: GoalBloomStatus;
  orbitalMilestones: TreeOrbitalMilestone[];
  goalCx: number;
  goalCy: number;
  /** Per-slot hub positions: adaptive N-gon (`adaptiveOrbitalVertices`), length ≥ visible milestone count. */
  hexVerts: readonly { x: number; y: number }[];
  snap: (n: number) => number;
  renderQuality?: TreeRenderQualityFactors;
  /** Life-area limb hex — tints jewel highlights toward branch hue. */
  limbColor?: string;
  /** Catalog / branch attach in world space (matches {@link goalAdaptiveOrbitalAttach} when adaptive layout is on). */
  branchAttachWorld?: { x: number; y: number };
  /** Life-importance vs lifecycle — scales organism authority without new ontology states. */
  visualAuthority?: GoalVisualAuthoritySpec;
}): BloomRenderSpec {
  const q = args.renderQuality ?? TREE_RENDER_QUALITY_FACTORS.balanced;
  const limbTint = args.limbColor ?? JEWEL_CORE_PINK_HEX;
  const auth = args.visualAuthority ?? NEUTRAL_GOAL_VISUAL_AUTHORITY;
  const af = authorityRenderFactors(auth.authorityMul);

  const derivedRaw = deriveGoalNodeRenderState({
    bloomStatus: args.bloomStatus,
    orbitalMilestones: args.orbitalMilestones,
  });
  const derived = applyTreeRenderQualityToDerived(derivedRaw, q);

  const visible = args.orbitalMilestones.slice(0, TREE_ORBITAL_MAX_VISIBLE);
  const n = visible.length;
  const defPrefix = bloomSpecDefPrefix(args.goalId);

  const wholeNode = applyAuthorityToWholeNode(
    applyTreeRenderQualityToWholeNode(
      deriveWholeNodeCoherence(derived.visualPhase, derived.progress01, n),
      q,
    ),
    af,
  );

  if (n === 0 || args.hexVerts.length < n) {
    return {
      goalId: args.goalId,
      defPrefix,
      derived,
      wholeNode,
      membranes: [],
      arcs: [],
      slots: [],
      branchAttachFillOpacity: 0,
      branchSpine: null,
      hubJewelLayers: [],
      membraneJewels: [],
      branchConvergenceHotspot: null,
      visualAuthority: auth,
    };
  }

  const verts = args.hexVerts;
  const phase = derived.visualPhase;
  const progress01 = derived.progress01;
  const attachVert =
    args.branchAttachWorld != null
      ? { x: args.snap(args.branchAttachWorld.x), y: args.snap(args.branchAttachWorld.y) }
      : verts[orbitalBranchAttachSlotIndex(n)]!;
  const branchSpineRaw =
    attachVert != null
      ? branchSpineForPhase(phase, progress01, attachVert, args.goalCx, args.goalCy, args.snap)
      : null;
  const branchSpine =
    branchSpineRaw != null
      ? {
          ...branchSpineRaw,
          strokeOpacity: clampBloomOpacity(
            branchSpineRaw.strokeOpacity * q.structuralLineMul * af.branchAttachOpacityAuthorityMul,
            0.12,
          ),
        }
      : null;

  const chordPairs =
    phase !== "ended" ? orbitalHexCompletedChordPairs(visible) : ([] as ReadonlyArray<readonly [number, number]>);

  const coherenceStroke =
    phase !== "ended" ? coherenceChordStrokeStyle(phase, progress01) : null;

  const membraneOpBase = membraneFillOpacityForPhase(phase, progress01);
  const arcWMul = arcCoherenceWidthMul(phase, progress01);
  const membraneInwardPullGrowingEarly = 0.141 + progress01 * 0.064;
  const membraneInwardPullGrowingLate = 0.171 + progress01 * 0.086;
  const membraneInwardPullBase =
    phase === "bloomed"
      ? 0.188 + progress01 * 0.098 + (progress01 >= 0.985 ? 0.028 : 0)
      : phase === "growing"
        ? lerp(membraneInwardPullGrowingEarly, membraneInwardPullGrowingLate, progress01)
        : 0.158 + progress01 * 0.078;
  /** Fewer milestones → pull membranes further toward hub so the hull reads as one enclosure. */
  const membranePullOrganismMul = phase === "bloomed" ? 1 + Math.max(0, 6 - n) * 0.026 : 1;
  const membraneInwardPull = membraneInwardPullBase * membranePullOrganismMul * af.membranePullAuthorityMul;

  const membranes: BloomMembraneSpec[] = [];
  const arcs: BloomAdjacencyArcSpec[] = [];
  const membraneJewels: BloomLuminousJewelSpec[] = [];

  for (const [ia, ib] of chordPairs) {
    const va = verts[ia]!;
    const vb = verts[ib]!;
    const bulge = organicChordBulgePx(args.goalId, ia, ib);
    const organic = organicChordOpacityFactor(args.goalId, ia, ib);
    const membraneBulge = bulge * 0.88;
    const { qx, qy } = orbitalHexChordQuadControl(
      va.x,
      va.y,
      vb.x,
      vb.y,
      args.goalCx,
      args.goalCy,
      membraneBulge,
    );

    if (membraneOpBase > 0.0018 && coherenceStroke) {
      const bloomedSeal = phase === "bloomed" && progress01 >= 0.985;
      const fillMul = bloomedSeal ? 1.22 : phase === "bloomed" ? 1.08 : 1;
      const fillCap = bloomedSeal ? 0.118 : 0.098;
      const fillOp = clampBloomOpacity(
        Math.min(
          fillCap,
          membraneOpBase *
            organic *
            fillMul *
            q.membraneFillMul *
            af.membraneFillAuthorityMul *
            (0.94 + 0.06 * af.luminousInnerPressureMul),
        ),
        0.14,
      );
      const membraneStrokeOp = Math.min(
        0.12,
        (phase === "bloomed"
          ? (bloomedSeal ? 0.068 : 0.056)
          : phase === "growing"
            ? lerp(0.032, 0.05, progress01)
            : 0.028) *
          q.membraneStrokeMul *
          af.membraneFillAuthorityMul,
      );
      membranes.push({
        ia,
        ib,
        d: membranePathD(
          va.x,
          va.y,
          vb.x,
          vb.y,
          args.goalCx,
          args.goalCy,
          membraneBulge,
          membraneInwardPull,
          args.snap,
        ),
        fillOpacity: fillOp,
        /* Softer than arcs — volume + whisper edge; arcs remain the dominant structural line. */
        strokeOpacity: membraneStrokeOp,
        strokeWidthPx:
          (phase === "bloomed"
            ? bloomedSeal
              ? 0.54
              : 0.48
            : phase === "growing"
              ? lerp(0.38, 0.46, progress01)
              : 0.34) * Math.min(1.08, af.arcChordAuthorityMul * 0.94 + 0.06),
      });

      const pull = membraneInwardPull;
      const aix = va.x + (args.goalCx - va.x) * pull;
      const aiy = va.y + (args.goalCy - va.y) * pull;
      const bix = vb.x + (args.goalCx - vb.x) * pull;
      const biy = vb.y + (args.goalCy - vb.y) * pull;
      const mx = (aix + bix) / 2;
      const my = (aiy + biy) / 2;
      const creaseBias = phase === "bloomed" ? 0.28 : 0.21;
      const jx = mx + (qx - mx) * creaseBias;
      const jy = my + (qy - my) * creaseBias;
      const jt = organicVariance01(`${args.goalId}:mj:${ia}:${ib}`);
      const jr = (0.78 + jt * 0.36) / (0.86 + 0.14 * af.materialHotspotMul);
      const junctionMat = af.materialHotspotMul * (0.82 + 0.18 * af.junctionEmphasisMul);
      const jop = Math.min(
        0.97,
        (phase === "bloomed"
          ? 0.46 + progress01 * 0.14
          : lerp(0.26, 0.42, progress01)) *
          q.coreJewelMul *
          af.hubJewelAuthorityMul *
          junctionMat,
      );
      membraneJewels.push({
        cx: args.snap(jx),
        cy: args.snap(jy),
        rPx: jr,
        fill: limbJewelHighlightStopColor(limbTint, 0.22),
        fillOpacity: jop,
        stroke: JEWEL_CORE_HOT_HEX,
        strokeOpacity: Math.min(
          0.88,
          (phase === "bloomed" ? 0.58 : 0.4) *
            q.coreJewelMul *
            af.hubJewelAuthorityMul *
            junctionMat,
        ),
        strokeWidthPx: 0.26,
      });
    }

    if (coherenceStroke) {
      const { qx, qy } = orbitalHexChordQuadControl(
        va.x,
        va.y,
        vb.x,
        vb.y,
        args.goalCx,
        args.goalCy,
        bulge,
      );
      let arcOp = coherenceStroke.opacity * organic * 1.12;
      if (phase === "growing") {
        const arcMulEarly = 1.04 + (organic - 0.87) * 0.16;
        arcOp *= lerp(arcMulEarly, 1.18, progress01);
      } else if (phase === "bloomed") {
        arcOp *= progress01 >= 0.985 ? 1.32 : 1.12 + progress01 * 0.08;
      }
      const arcCap =
        (phase === "bloomed" ? (progress01 >= 0.985 ? 0.112 : 0.102) : 0.086) * q.arcOpacityCapMul;
      arcs.push({
        ia,
        ib,
        d: `M ${args.snap(va.x)} ${args.snap(va.y)} Q ${args.snap(qx)} ${args.snap(qy)} ${args.snap(vb.x)} ${args.snap(vb.y)}`,
        strokeOpacity: clampBloomOpacity(
          Math.min(
            arcCap,
            arcOp *
              q.arcOpacityMul *
              af.arcChordAuthorityMul *
              (0.93 + 0.07 * af.junctionEmphasisMul),
          ),
          0.125,
        ),
        strokeWidthPx: coherenceStroke.strokeWidthPx * arcWMul * Math.min(1.06, af.arcChordAuthorityMul * 0.92 + 0.08),
      });
    }
  }

  const glowTemplate = derived.intensities.orbitalCompletedGlowLayers;
  const petalRgMul = phase === "bloomed" ? q.bloomedMidGlowRadiusMul : 1;
  const strokeScale = derived.intensities.incompleteOrbitalStrokeOpacityScale;

  const incompleteBlend =
    (0.4 + 0.42 * (1 - progress01)) *
    (phase === "growing" ? lerp(1, 0.98, progress01) : 1);

  const slots: BloomOrbitalSlotSpec[] = visible.map((m, mi) => {
    const vp = verts[mi]!;
    let petalForm01 = 0;
    if (m.completed && phase !== "ended") {
      petalForm01 = petalForm01ForCompletedSlot(phase, progress01);
      if (phase === "growing") {
        petalForm01 = Math.min(1, petalForm01 + growingAdjacentCompletionBias01(visible, mi) * 0.13);
      }
      /* Lower hemisphere joins the silhouette — subtle, avoids top-heavy bloom reads. */
      const lowerBoost = mi === 3 ? 0.032 : mi === 2 || mi === 4 ? 0.017 : 0;
      if (lowerBoost > 0) {
        petalForm01 = Math.min(
          1,
          petalForm01 + lowerBoost * (0.48 + progress01 * 0.52),
        );
      }
      /* Closed hex + BLOOMED: equal radial weight so the organism reads one symmetric corolla. */
      if (
        phase === "bloomed" &&
        derived.completedOrbitalCount === derived.visibleOrbitalCount &&
        derived.visibleOrbitalCount > 0
      ) {
        const sealBoost = derived.visibleOrbitalCount >= 6 ? 0.028 : 0.034;
        petalForm01 = Math.min(1, petalForm01 + sealBoost + progress01 * 0.024);
      }
    } else if (m.completed && phase === "ended") {
      petalForm01 = 0.42;
    }
    petalForm01 = Math.min(1, petalForm01 * af.petalAuthorityMul);

    const neighbors = adjCompletedNeighbors(visible, mi);
    let petalPathD: string | null = null;
    let petalAxialGradient: BloomOrbitalSlotSpec["petalAxialGradient"] = null;
    let petalFeedPathD: string | null = null;
    let petalFeedStrokeOpacity = 0;

    const lateralTipPx =
      phase === "growing" && m.completed
        ? growingPetalLateralTipPx(
            args.goalId,
            visible,
            mi,
            TREE_GOAL_ORBITAL_CRISP_RADIUS_PX,
            progress01,
          )
        : 0;

    let petalStemJewel: BloomLuminousJewelSpec | null = null;
    let petalJunctionHotspot: BloomLuminousJewelSpec | null = null;

    if (m.completed) {
      const geom = teardropPetalGeometry(
        vp.x,
        vp.y,
        args.goalCx,
        args.goalCy,
        petalForm01,
        neighbors,
        args.snap,
        lateralTipPx,
      );
      petalPathD = geom.pathD;
      petalAxialGradient = {
        x1: geom.innerStem.x,
        y1: geom.innerStem.y,
        x2: geom.tip.x,
        y2: geom.tip.y,
      };
      petalFeedPathD = petalFeedCurvePathD(geom.innerStem, args.goalCx, args.goalCy, args.snap);
      petalFeedStrokeOpacity =
        petalFeedStrokeOpacityForPhase(phase, progress01) * q.structuralLineMul;

      if (phase !== "ended") {
        const stemHot = af.materialHotspotMul * (0.82 + 0.18 * af.junctionEmphasisMul);
        const stemBlend = phase === "bloomed" ? 0.34 : lerp(0.28, 0.32, progress01);
        const jx = geom.innerStem.x * (1 - stemBlend) + vp.x * stemBlend;
        const jy = geom.innerStem.y * (1 - stemBlend) + vp.y * stemBlend;
        const sj = organicVariance01(`${args.goalId}:stemjewel:${mi}`);
        const jr = phase === "bloomed" ? 1.18 + sj * 0.24 : 0.92 + sj * 0.22;
        petalStemJewel = {
          cx: args.snap(jx),
          cy: args.snap(jy),
          rPx: jr,
          fill: JEWEL_CORE_HOT_HEX,
          fillOpacity: Math.min(
            0.88,
            (phase === "bloomed" ? 0.54 : lerp(0.32, 0.46, progress01)) *
              q.coreJewelMul *
              af.hubJewelAuthorityMul *
              stemHot,
          ),
          stroke: limbJewelHighlightStopColor(limbTint, 0.2),
          strokeOpacity: Math.min(
            0.76,
            (phase === "bloomed" ? 0.48 : 0.34) *
              q.coreJewelMul *
              af.hubJewelAuthorityMul *
              stemHot,
          ),
          strokeWidthPx: 0.28,
        };

        const hubMix = 0.46;
        const jhx = args.goalCx * hubMix + geom.innerStem.x * (1 - hubMix);
        const jhy = args.goalCy * hubMix + geom.innerStem.y * (1 - hubMix);
        const pjv = organicVariance01(`${args.goalId}:petaljx:${mi}`);
        const pjr = (0.52 + pjv * 0.22) / (0.88 + 0.12 * af.materialHotspotMul);
        const pjOp = Math.min(
          0.84,
          (phase === "bloomed" ? 0.38 : lerp(0.22, 0.32, progress01)) *
            q.coreJewelMul *
            af.materialHotspotMul *
            af.junctionEmphasisMul,
        );
        petalJunctionHotspot = {
          cx: args.snap(jhx),
          cy: args.snap(jhy),
          rPx: pjr,
          fill: limbJewelHighlightStopColor(limbTint, 0.36),
          fillOpacity: pjOp,
          stroke: JEWEL_CORE_HOT_HEX,
          strokeOpacity: Math.min(
            0.78,
            (phase === "bloomed" ? 0.48 : 0.36) *
              af.materialHotspotMul *
              af.junctionEmphasisMul,
          ),
          strokeWidthPx: 0.22,
        };
      }
    }

    const adjGlowMul = orbitalGlowAdjacencyMultiplier(visible, mi);
    const glowLayers = glowTemplate;
    const farGlowSource = glowLayers.length >= 3 ? glowLayers[0]! : null;
    const midLayer = glowLayers.length >= 3 ? glowLayers[2]! : glowLayers[1] ?? glowLayers[0]!;
    const { radiusMul, opacityMul } = organicOrbitalGlowVariation(args.goalId, mi, 0);
    const calmMul =
      phase === "bloomed" ? 0.76 : phase === "growing" ? lerp(0.92, 0.84, progress01) : 0.72;
    /* BLOOMED full ring: lift stack so the closed flower doesn’t dim; otherwise curb cumulative glow. */
    const fullRingBloom =
      phase === "bloomed" &&
      derived.completedOrbitalCount === derived.visibleOrbitalCount &&
      derived.visibleOrbitalCount > 0;
    const adjacencyStackMul = fullRingBloom
      ? 1.05
      : derived.completedOrbitalCount >= 5
        ? 0.9
        : derived.completedOrbitalCount >= 4
          ? 0.95
          : 1;
    const undershapeGlowFar: BloomOrbitalGlowLayerSpec | null =
      m.completed && farGlowSource != null && phase !== "ended"
        ? {
            radiusPx: farGlowSource.radiusPx * 0.84 * petalRgMul,
            fillOpacity: clampBloomOpacity(
              Math.min(
                0.052,
                farGlowSource.fillOpacity *
                  calmMul *
                  0.58 *
                  adjacencyStackMul *
                  af.undershapeAuthorityMul *
                  af.veilAttenuationMul,
              ),
              0.1,
            ),
            radiusMul,
            opacityMul:
              opacityMul *
              adjGlowMul *
              calmMul *
              0.68 *
              adjacencyStackMul *
              af.veilAttenuationMul,
          }
        : null;
    const undershapeGlow: BloomOrbitalGlowLayerSpec | null = m.completed
      ? {
          radiusPx: midLayer.radiusPx * 0.92 * petalRgMul,
          fillOpacity: clampBloomOpacity(
            Math.min(
              0.112,
              midLayer.fillOpacity *
                calmMul *
                1.06 *
                adjacencyStackMul *
                af.undershapeAuthorityMul *
                af.luminousInnerPressureMul,
            ),
            0.14,
          ),
          radiusMul,
          opacityMul:
            opacityMul *
            adjGlowMul *
            calmMul *
            adjacencyStackMul *
            (0.82 + 0.18 * af.luminousInnerPressureMul),
        }
      : null;

    const ir = incompleteOrbitalRingGeometry(phase, mi, n, args.goalId, progress01);

    return {
      milestoneId: m.id,
      title: m.title,
      vertexIndex: mi,
      completed: m.completed,
      vertex: vp,
      petalForm01,
      petalPathD,
      petalAxialGradient,
      petalFeedPathD,
      petalFeedStrokeOpacity,
      undershapeGlowFar,
      undershapeGlow,
      petalStemJewel,
      petalJunctionHotspot,
      incompleteRingStrokeOpacity:
        0.56 * strokeScale * incompleteBlend * ir.opacityMul * q.incompleteRingOpacityMul,
      incompleteRingDasharray: ir.dash,
      incompleteRingRadius: ir.r,
      incompleteRingStrokeWidthPx: ir.sw,
    };
  });

  let branchAttachFillOpacity =
    phase !== "ended" && derived.completedOrbitalCount > 0
      ? branchAttachVitalityFillOpacity(phase, progress01)
      : 0;
  branchAttachFillOpacity = clampBloomOpacity(
    branchAttachFillOpacity * q.attachMul * af.branchAttachOpacityAuthorityMul,
    0.175,
  );

  let branchConvergenceHotspot: BloomLuminousJewelSpec | null = null;
  if (
    phase !== "ended" &&
    phase !== "bud" &&
    attachVert != null &&
    derived.completedOrbitalCount > 0
  ) {
    const dx = attachVert.x - args.goalCx;
    const dy = attachVert.y - args.goalCy;
    const len = Math.hypot(dx, dy) || 1;
    const outwardPx = 1.35 + progress01 * 0.55;
    const bcx = attachVert.x + (dx / len) * outwardPx;
    const bcy = attachVert.y + (dy / len) * outwardPx;
    const bjv = organicVariance01(`${args.goalId}:branch-hot`);
    branchConvergenceHotspot = {
      cx: args.snap(bcx),
      cy: args.snap(bcy),
      rPx: (0.86 + bjv * 0.26) / (0.88 + 0.12 * af.materialHotspotMul),
      fill: limbJewelHighlightStopColor(limbTint, 0.32),
      fillOpacity: Math.min(
        0.64,
        (0.22 + progress01 * 0.15) *
          q.coreJewelMul *
          af.materialHotspotMul *
          af.branchAttachOpacityAuthorityMul *
          (0.82 + 0.18 * af.junctionEmphasisMul),
      ),
      stroke: JEWEL_CORE_HOT_HEX,
      strokeOpacity: Math.min(
        0.72,
        (phase === "bloomed" ? 0.44 : 0.34) *
          af.materialHotspotMul *
          af.junctionEmphasisMul,
      ),
      strokeWidthPx: 0.24,
    };
  }

  const hubJewelLayers = buildHubJewelLayers(
    args.snap,
    args.goalCx,
    args.goalCy,
    phase,
    progress01,
    q,
    limbTint,
    af.hubJewelAuthorityMul,
    af.luminousInnerPressureMul,
    af.materialHotspotMul,
    af.veilAttenuationMul,
  );

  return {
    goalId: args.goalId,
    defPrefix,
    derived,
    wholeNode,
    membranes,
    arcs,
    slots,
    branchAttachFillOpacity,
    branchSpine,
    hubJewelLayers,
    membraneJewels,
    branchConvergenceHotspot,
    visualAuthority: auth,
  };
}
