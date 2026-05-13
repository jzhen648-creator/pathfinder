/**
 * Vascular trunk mass: pressure-shaped width, asymmetric contour, surface attach points.
 * Geometry is SVG-path friendly (layered closed paths, no bitmap noise). Numeric sampling keeps
 * future animation hooks (flow along centerline, pulse by pressure field) modular.
 */
import type { Point } from "./tree-types";

export const TRUNK_AXIS_X = 600;

/** Crown band — matches legacy silhouette top anchor (SVG y, down-positive). */
export const TRUNK_CROWN_Y = 432;
/** Ground pinch — shared organism anchor at the base of the trunk silhouette. */
export const TRUNK_BASE_Y = 1356;

/** Vertical trunk domain for width / pressure evaluation. */
const TRUNK_SPAN = TRUNK_BASE_Y - TRUNK_CROWN_Y;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Normalized height along trunk: 0 = crown, 1 = base. */
export function trunkNormY(y: number): number {
  return clamp01((y - TRUNK_CROWN_Y) / TRUNK_SPAN);
}

/**
 * Coherent pressure field: accumulated column loading toward roots, local swells at major emergence bands,
 * slight lateral shear (grown under pressure, not linear taper).
 */
export function deriveTrunkPressure01(y: number): number {
  const t = trunkNormY(y);
  const rootLoad = t ** 1.52;
  const midPulse = 0.09 * Math.sin(t * Math.PI * 2.15 + 0.35);
  const shoulder = 0.05 * Math.sin(t * Math.PI * 3.2 + 0.9);
  return clamp01(rootLoad + midPulse + shoulder);
}

/** Localized diameter swells along the emergence ladder (normalized t), deterministic — not noise. */
function emergenceSwellAtY(y: number): number {
  const t = trunkNormY(y);
  const g = (center: number, sigma: number, amp: number) =>
    Math.exp(-(((t - center) / sigma) ** 2)) * amp;
  return (
    g(0.12, 0.055, 2.4) +
    g(0.28, 0.078, 2.9) +
    g(0.42, 0.082, 3.3) +
    g(0.58, 0.078, 3.1) +
    g(0.74, 0.082, 2.9) +
    g(0.9, 0.068, 3.6)
  );
}

export type TrunkEmergenceSide = "left" | "right" | "center";

export function trunkEmergenceSideForArea(areaId: string): TrunkEmergenceSide {
  if (areaId === "work" || areaId === "finance") return "left";
  if (areaId === "people" || areaId === "health" || areaId === "pleasures") return "right";
  return "center";
}

/**
 * Half-width of vascular column at y (px). Flares at roots, tapers upward, swells near emergence bands.
 */
export function deriveTrunkHalfWidthAtY(y: number): number {
  const p = deriveTrunkPressure01(y);
  const baseTaper = 8.8 + p * p * 38 + p * 5;
  const band = emergenceSwellAtY(y);
  return baseTaper + band;
}

/** Slow lateral drift of the pressure column (slight asymmetry). */
export function deriveTrunkCenterlineX(y: number): number {
  const t = trunkNormY(y);
  const shear =
    5.2 * Math.sin(t * Math.PI * 1.85 + 0.5) +
    2.4 * Math.sin(t * Math.PI * 4.1) +
    1.1 * Math.sin(t * Math.PI * 6.2);
  return TRUNK_AXIS_X + shear;
}

/** Left/right edge asymmetry factor (−1…1 scale applied to half-width). */
function lateralAsym01(y: number): number {
  const t = trunkNormY(y);
  return 0.16 * Math.sin(t * Math.PI * 2.4 + 0.2) + 0.045 * Math.sin(t * Math.PI * 5.1);
}

export function deriveTrunkContourXs(y: number): { leftX: number; rightX: number } {
  const cx = deriveTrunkCenterlineX(y);
  const hw = deriveTrunkHalfWidthAtY(y);
  const asym = lateralAsym01(y);
  const hwL = hw * (1 + asym);
  const hwR = hw * (1 - asym);
  return { leftX: cx - hwL, rightX: cx + hwR };
}

/**
 * Surface attach point on trunk mass — limb emergence from contour, slightly embedded into the column.
 */
export function deriveTrunkSurfaceAttach(y: number, side: TrunkEmergenceSide): Point {
  const cx = deriveTrunkCenterlineX(y);
  if (side === "center") {
    const micro = 2.1 * Math.sin(trunkNormY(y) * Math.PI * 1.2);
    return { x: cx + micro, y };
  }
  const { leftX, rightX } = deriveTrunkContourXs(y);
  const surf = side === "left" ? leftX : rightX;
  /** Near full contour — limbs read as embedded in mass, not on a soft center embed. */
  const embed = 0.038;
  const x = surf + (cx - surf) * embed;
  return { x, y };
}

/** Reserved for parallax; keep 0 so branch strokes stay registered with stem/trunk (no lateral shear at bole). */
export function deriveBranchDepthPhaseNudgePx(_areaId: string, _branchIndex: number): number {
  return 0;
}

/** Closed Catmull-Rom → cubic Bézier loop (uniform knots). */
function closedSmoothCurveThroughPoints(pts: Point[]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M${snap(pts[0].x)},${snap(pts[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${snap(c1.x)},${snap(c1.y)} ${snap(c2.x)},${snap(c2.y)} ${snap(p2.x)},${snap(p2.y)}`;
  }
  d += " Z";
  return d;
}

function snap(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function linspace(a: number, b: number, count: number): number[] {
  if (count <= 1) return [a];
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(a + ((b - a) * i) / (count - 1));
  return out;
}

export type TrunkLayerPaths = {
  outerD: string;
  bodyD: string;
  veinD: string;
  veilD: string;
  /** Ground flare merged into organism base (continuity with roots). */
  rootFlareD: string;
};

function outlineClosedPath(halfWidthMul: number): string {
  const yBottom = TRUNK_BASE_Y;
  const yTop = TRUNK_CROWN_Y;
  const nSide = 24;
  const yLeft = linspace(yTop, yBottom - 16, nSide);
  const leftPts: Point[] = yLeft.map((y) => {
    const cx = deriveTrunkCenterlineX(y);
    const hw = deriveTrunkHalfWidthAtY(y) * halfWidthMul;
    const asym = lateralAsym01(y);
    const x = cx - hw * (1 + asym);
    return { x, y };
  });

  const lb = leftPts[leftPts.length - 1]!;
  const pinchL = {
    x: lb.x + (TRUNK_AXIS_X - lb.x) * 0.4,
    y: yBottom - 9,
  };

  const yRight = linspace(yBottom - 16, yTop, nSide);
  const rightPts: Point[] = yRight.map((y) => {
    const cx = deriveTrunkCenterlineX(y);
    const hw = deriveTrunkHalfWidthAtY(y) * halfWidthMul;
    const asym = lateralAsym01(y);
    const x = cx + hw * (1 - asym);
    return { x, y };
  });

  const rb = rightPts[0]!;
  const pinchR = {
    x: rb.x + (TRUNK_AXIS_X - rb.x) * 0.4,
    y: yBottom - 9,
  };

  const lt = leftPts[0]!;
  const rt = rightPts[rightPts.length - 1]!;
  const crownL = { x: (lt.x + TRUNK_AXIS_X) / 2 - 2.5, y: yTop - 2 };
  const crownR = { x: (rt.x + TRUNK_AXIS_X) / 2 + 2.5, y: yTop - 2 };

  const chain: Point[] = [
    ...leftPts,
    pinchL,
    { x: TRUNK_AXIS_X, y: yBottom },
    pinchR,
    ...rightPts,
    crownR,
    crownL,
  ];

  return closedSmoothCurveThroughPoints(chain);
}

/**
 * Layered trunk silhouettes: outer mass, pressure body, inner luminous vein, soft veil overlay.
 * Ratios match bloom language (compressed core, absorbed edge) — tuned via SVG gradients in tree-svg.
 */
export function deriveTrunkPressureLayers(): TrunkLayerPaths {
  return {
    outerD: outlineClosedPath(1.06),
    bodyD: outlineClosedPath(1),
    veinD: outlineClosedPath(0.36),
    veilD: outlineClosedPath(0.92),
    rootFlareD: rootFlarePath(),
  };
}

function rootFlarePath(): string {
  const y0 = TRUNK_BASE_Y - 14;
  const spread = 138;
  const lift = 48;
  const cx = TRUNK_AXIS_X;
  return [
    `M${cx - 32},${y0}`,
    `C${cx - spread * 0.92},${y0 + lift * 0.28} ${cx - spread},${y0 + lift * 0.72} ${cx - spread * 1.08},${y0 + lift + 22}`,
    `C${cx - 72},${y0 + lift + 48} ${cx - 34},${y0 + lift + 56} ${cx},${y0 + lift + 60}`,
    `C${cx + 34},${y0 + lift + 56} ${cx + 72},${y0 + lift + 48} ${cx + spread * 1.08},${y0 + lift + 22}`,
    `C${cx + spread},${y0 + lift * 0.72} ${cx + spread * 0.92},${y0 + lift * 0.28} ${cx + 32},${y0}`,
    `C${cx + 18},${y0 - 9} ${cx - 18},${y0 - 9} ${cx - 32},${y0}`,
    `Z`,
  ].join(" ");
}
