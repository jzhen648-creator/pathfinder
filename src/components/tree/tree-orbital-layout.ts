/**
 * Adaptive orbital layout: milestone slots map to an **N-gon** (N = visible count),
 * not a fixed hex. Internal milestone indices stay 0…N−1; only **screen positions** adapt.
 */

import type { Point } from "./tree-types";

/** Circumradius scale so sparse organisms stay legible; dense hex stays at baseline. */
export function orbitalLayoutRadiusMul(visibleCount: number): number {
  const n = Math.max(1, Math.min(6, Math.round(visibleCount)));
  switch (n) {
    case 1:
      return 0.88;
    case 2:
      return 1.12;
    case 3:
      return 1.06;
    case 4:
      return 1.03;
    case 5:
      return 1.01;
    default:
      return 1;
  }
}

/**
 * `n` vertices on a regular N-gon, pointy-top (first slot at top), same convention as hex but
 * with step `2π/n` instead of `π/3`.
 */
export function adaptiveOrbitalVertices(
  cx: number,
  cy: number,
  r: number,
  n: number,
  rotationRad = 0,
): Point[] {
  const count = Math.max(1, Math.min(6, Math.round(n)));
  return Array.from({ length: count }, (_, i) => {
    const th = -Math.PI / 2 + (i * 2 * Math.PI) / count + rotationRad;
    return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
  });
}

/**
 * Slot index toward **+Y** (catalog / branch feed direction): stable attach for any N.
 * For n=6 matches legacy hex bottom index `3`.
 */
export function orbitalBranchAttachSlotIndex(n: number): number {
  const count = Math.max(1, Math.min(6, Math.round(n)));
  /* Single milestone: slot 0 is canonical; attach offset handled in {@link goalAdaptiveOrbitalAttach}. */
  if (count === 1) return 0;
  let bestI = 0;
  let bestSin = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const th = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const s = Math.sin(th);
    if (s > bestSin) {
      bestSin = s;
      bestI = i;
    }
  }
  return bestI;
}

/** Branch / child-spoke attach on the organism ring (adaptive N-gon). */
export function goalAdaptiveOrbitalAttach(
  cx: number,
  cy: number,
  r: number,
  n: number,
  rotationRad = 0,
): Point {
  const count = Math.max(1, Math.min(6, Math.round(n)));
  if (count === 1) {
    const th = Math.PI / 2 + rotationRad;
    return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
  }
  const verts = adaptiveOrbitalVertices(cx, cy, r, count, rotationRad);
  return verts[orbitalBranchAttachSlotIndex(count)]!;
}
