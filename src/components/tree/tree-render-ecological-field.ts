/**
 * Render-only ecological atmosphere helpers (limb hull continuity, voids, filaments).
 * No routing, fork geometry, or hull point-set logic — consumed by `tree-svg` only.
 */
import { stableRenderJitter01 } from "./tree-render-materials";

export type EcologicalPocketPoint = {
  cx: number;
  cy: number;
  op: number;
  k: string;
  /** 0 = distal / sparse, 1 = emergence / hub-adjacent — biases filaments & void skips. */
  emergence01: number;
};

/** Deterministic void: skip pocket for uneven occupation (fewer voids near dense emergence). */
export function ecologicalPocketVoidSkip(seed: string, emergence01: number): boolean {
  const u = stableRenderJitter01(`void:${seed}`);
  const threshold = 0.58 + emergence01 * 0.2;
  return u > threshold;
}

/** Irregular stem samples (avoids equal spacing along limb). */
export function irregularStemSampleTs(areaId: string): number[] {
  const out: number[] = [];
  let t = 0.055 + stableRenderJitter01(`${areaId}:stem0`) * 0.07;
  const maxT = 0.9;
  for (let k = 0; k < 8 && t < maxT; k += 1) {
    out.push(t);
    const step = 0.09 + stableRenderJitter01(`${areaId}:stemStep${k}`) * 0.17;
    t += step;
  }
  return out.length > 0 ? out : [0.12, 0.52, 0.84];
}

/** Non-uniform scale + drift for ellipse cadence break. */
export function pocketEllipseShapeJitter(seed: string): {
  rxMul: number;
  ryMul: number;
  dcx: number;
  dcy: number;
} {
  const a = stableRenderJitter01(`${seed}:ejx`);
  const b = stableRenderJitter01(`${seed}:ejy`);
  return {
    rxMul: 0.82 + a * 0.38,
    ryMul: 0.78 + b * 0.42,
    dcx: (a - 0.5) * 14,
    dcy: (b - 0.5) * 12,
  };
}

/** Whether this pocket may render a soft overshoot copy outside the hull clip. */
export function pocketHullBleedEligible(seed: string, emergence01: number): boolean {
  const u = stableRenderJitter01(`bleed:${seed}`);
  return u < 0.09 + emergence01 * 0.08;
}

export type EcologicalFilament = {
  k: string;
  d: string;
  strokeOpacity: number;
  strokeWidth: number;
};

/**
 * Sparse faint splines between some pocket pairs — environmental carry, not a mesh.
 */
export function buildEcologicalFilaments(
  points: EcologicalPocketPoint[],
  areaId: string,
  maxLinks: number,
): EcologicalFilament[] {
  if (points.length < 2) return [];
  const n = points.length;
  type Cand = { i: number; j: number; score: number; dist: number };
  const cands: Cand[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = points[i]!;
      const b = points[j]!;
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 26 || dist > 96) continue;
      const gate = stableRenderJitter01(`${areaId}:fil:${a.k}:${b.k}`);
      if (gate > 0.74) continue;
      const em = (a.emergence01 + b.emergence01) * 0.5;
      const score = em * (1 - gate * 0.85) * (1 - Math.abs(dist - 58) / 80);
      cands.push({ i, j, score, dist });
    }
  }
  cands.sort((u, v) => v.score - u.score);
  const out: EcologicalFilament[] = [];
  const used = new Set<string>();
  for (const c of cands) {
    if (out.length >= maxLinks) break;
    const key = `${c.i}-${c.j}`;
    if (used.has(key)) continue;
    used.add(key);
    const a = points[c.i]!;
    const b = points[c.j]!;
    const mx = (a.cx + b.cx) / 2;
    const my = (a.cy + b.cy) / 2;
    const nx = -(b.cy - a.cy) / (c.dist || 1);
    const ny = (b.cx - a.cx) / (c.dist || 1);
    const bend = (stableRenderJitter01(`${areaId}:filbend:${key}`) - 0.5) * 22 * (0.35 + c.score);
    const qx = mx + nx * bend;
    const qy = my + ny * bend;
    const strokeOpacity = Math.min(
      0.014,
      0.0038 + 0.009 * c.score * Math.min(a.op, b.op) * 42,
    );
    out.push({
      k: `fil-${areaId}-${key}`,
      d: `M${a.cx},${a.cy} Q${qx},${qy} ${b.cx},${b.cy}`,
      strokeOpacity,
      strokeWidth: 2.4 + stableRenderJitter01(`${areaId}:filw:${key}`) * 1.8,
    });
  }
  return out;
}

export type EcologicalCarryStreak = {
  k: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  fillOpacity: number;
};

/** Ultra-faint elongated residue (flat fill + blur in SVG), not radial. */
export function buildEcologicalCarryStreaks(args: {
  areaId: string;
  attachX: number;
  attachY: number;
  driftX: number;
  driftY: number;
  hubDensity: number;
}): EcologicalCarryStreak[] {
  const { areaId, attachX, attachY, driftX, driftY, hubDensity } = args;
  const streaks: EcologicalCarryStreak[] = [];
  const count = 2 + (stableRenderJitter01(`${areaId}:carryN`) > 0.55 ? 1 : 0);
  for (let s = 0; s < count; s += 1) {
    const u = stableRenderJitter01(`${areaId}:carry${s}`);
    const cx = attachX + driftX * (0.35 + u * 0.55) + (u - 0.5) * 40;
    const cy = attachY + driftY * (0.28 + u * 0.5) + (stableRenderJitter01(`${areaId}:carry${s}y`) - 0.5) * 28;
    streaks.push({
      k: `carry-${areaId}-${s}`,
      cx,
      cy,
      rx: 52 + u * 72 + hubDensity * 24,
      ry: 7 + u * 11 + hubDensity * 4,
      rot: -18 + u * 46 + stableRenderJitter01(`${areaId}:carry${s}r`) * 12,
      fillOpacity: 0.0028 + hubDensity * 0.0022 + u * 0.0016,
    });
  }
  return streaks;
}
