import {
  pathPointAtT,
  pickThreadMomentsForTree,
  resolvedChainMomentPos,
} from "./tree-branch-geometry";
import { isHubGatewayLayout, limbPathBetweenGlobalT } from "./tree-forks";
import type { AreaForkSpec } from "./tree-forks";
import type { DomainHubData, MomentNode, Point } from "./tree-types";
import {
  TREE_THREAD_MARKER_VISUALS_ENABLED,
  TREE_THREAD_VISIBLE_MOMENTS,
  nodeRadius,
} from "./tree-view-constants";

/**
 * Parallel edge offset applied after the convex hull (same units as tree SVG).
 * Keep modest: large values make adjacent limb tints overlap along the trunk band.
 */
export const LIMB_BACKDROP_PAD_PX = 4;

/**
 * After {@link LIMB_BACKDROP_PAD_PX} outward offset, pull edges slightly inward (convex hull only).
 * Reduces bleed into neighboring limb polygons along the trunk.
 */
const LIMB_BACKDROP_EDGE_PULLBACK_PX = 3;

/** Limb tint behind nodes/lines — low so goal blooms remain the sacred focal read. */
export const LIMB_BACKDROP_FILL_OPACITY = 0.046;

/** ~Collision radius per life area for “toys on water” separation (hub proxy, SVG px). */
export const LIFE_AREA_FLOAT_PACKING_RADIUS_PX = 210;
/** Minimum clear band between those radii after relaxation. */
export const LIFE_AREA_FLOAT_MIN_CLEARANCE_PX = 16;
/** Iterations of pairwise gentle repulsion. */
export const LIFE_AREA_FLOAT_SEPARATION_ITERS = 10;

/**
 * Pairwise hub repulsion so life-area groups drift apart slightly without overlapping, like floats on water.
 * Returns **translation** (dx, dy) in SVG space to apply to each limb `<g>` (same for branches + backdrop).
 */
export function computeLifeAreaLimbFloatNudgesPx(
  areaIds: readonly string[],
  hubOf: (areaId: string) => Point | null | undefined,
  opts?: {
    radiusPx?: number;
    minClearancePx?: number;
    iterations?: number;
    pushStrength?: number;
  },
): Record<string, Point> {
  const R = opts?.radiusPx ?? LIFE_AREA_FLOAT_PACKING_RADIUS_PX;
  const gap = opts?.minClearancePx ?? LIFE_AREA_FLOAT_MIN_CLEARANCE_PX;
  const iters = opts?.iterations ?? LIFE_AREA_FLOAT_SEPARATION_ITERS;
  const strength = opts?.pushStrength ?? 0.44;
  const n = areaIds.length;
  const out: Record<string, Point> = {};
  if (n < 2) {
    for (const id of areaIds) out[id] = { x: 0, y: 0 };
    return out;
  }
  const orig: Point[] = areaIds.map((id) => {
    const p = hubOf(id);
    return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
  });
  const pos = orig.map((p) => ({ x: p.x, y: p.y }));
  const want = 2 * R + gap;
  for (let iter = 0; iter < iters; iter += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pos[i]!.x - pos[j]!.x;
        let dy = pos[i]!.y - pos[j]!.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d >= want) continue;
        const push = (want - d) * strength;
        dx /= d;
        dy /= d;
        const bob =
          0.14 *
          Math.sin((iter * 1.17 + i * 2.1 + j * 1.73 + areaIds[i]!.length * 0.09) % 6.283);
        const px = -dy * bob;
        const py = dx * bob;
        pos[i]!.x += dx * push + px;
        pos[i]!.y += dy * push + py;
        pos[j]!.x -= dx * push - px;
        pos[j]!.y -= dy * push - py;
      }
    }
  }
  for (let k = 0; k < n; k += 1) {
    const id = areaIds[k]!;
    out[id] = { x: pos[k]!.x - orig[k]!.x, y: pos[k]!.y - orig[k]!.y };
  }
  return out;
}

function pushPoint(pts: Point[], p: Point) {
  pts.push({ x: p.x, y: p.y });
}

function pushDiscBoundary(pts: Point[], cx: number, cy: number, r: number, steps = 8) {
  if (r <= 0) return;
  for (let k = 0; k < steps; k += 1) {
    const ang = (k / steps) * Math.PI * 2;
    pushPoint(pts, { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
}

function samplePathCenters(
  pts: Point[],
  path: string,
  t0: number,
  t1: number,
  sampleCount: number,
) {
  if (!path || sampleCount < 2) return;
  const lo = Math.max(0, Math.min(1, t0));
  const hi = Math.max(0, Math.min(1, t1));
  if (hi <= lo + 1e-9) return;
  for (let i = 0; i < sampleCount; i += 1) {
    const u = lo + ((hi - lo) * i) / (sampleCount - 1);
    const p = pathPointAtT(path, u);
    pushPoint(pts, p);
  }
}

export function momentBoundsRadius(m: MomentNode): number {
  const r = nodeRadius(m.significance);
  if (m.isTurningPoint && m.bloomStatus === "BLOOMED") return 14;
  if (m.bloomStatus === "GROWING" || m.future) return r + 6;
  return r + 3;
}

export type LimbBackdropBranchRow = {
  thread: DomainHubData;
  threadForTree: DomainHubData;
  idx: number;
  threadMainDraw: string;
  threadCatalogFull: string;
  threadSlotStrokeWidth: number;
  nextGoalSlotT: number;
  momentChordTEnd: number;
  kFork: number;
};

export type LimbBackdropBoundsInput = {
  areaId: string;
  limbPath: string;
  limbStrokeWidth: number;
  forkSpec: AreaForkSpec | undefined;
  branchForkTs: number[];
  sortedBranchIdx: number[];
  branches: LimbBackdropBranchRow[];
  momentPositions: Record<string, Point> | undefined;
  showMarksByZoom: boolean;
  showAllGoalMilestonesByZoom: boolean;
  goalHighlightId: string | undefined;
  trunkExcludeCenter: Point;
};

export type LimbBackdropHull = {
  /** `points` attribute for `<polygon>`. */
  pointsAttr: string;
  /** Outward-offset hull vertices (CCW). */
  vertices: Point[];
  centroid: Point;
};

/** Soft per–life-area veil: principal-axis ellipse wrapping the hull footprint. */
export type LimbBackdropVeilEllipse = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotDeg: number;
};

/**
 * Single large diffuse ellipse aligned to hull spread (covariance of offset vertices).
 * Render behind branch strokes with a heavy blur for “membrane” read.
 */
export function limbBackdropPrincipalVeilEllipse(hull: LimbBackdropHull): LimbBackdropVeilEllipse {
  const { vertices, centroid: c } = hull;
  const n = vertices.length;
  if (n === 0) {
    return { cx: c.x, cy: c.y, rx: 96, ry: 72, rotDeg: -6 };
  }
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const v of vertices) {
    const dx = v.x - c.x;
    const dy = v.y - c.y;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  const invN = 1 / Math.max(1, n);
  cxx *= invN;
  cyy *= invN;
  cxy *= invN;
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, trace * trace * 0.25 - det);
  const root = Math.sqrt(disc);
  const lamBig = trace * 0.5 + root;
  const lamSm = Math.max(trace * 0.5 - root, 1e-9);
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  /** Ellipse mass slightly smaller vs hull so adjacent tints can sit close without merging. */
  const scale = 1.28;
  const inflate = 0.94;
  const rx = Math.max(scale * Math.sqrt(lamBig) * inflate, 34);
  const ry = Math.max(scale * Math.sqrt(lamSm) * inflate, 28);
  return {
    cx: c.x,
    cy: c.y,
    rx,
    ry,
    rotDeg: (theta * 180) / Math.PI,
  };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHullMonotoneChain(points: Point[]): Point[] {
  if (points.length <= 1) return points.slice();
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const uniq: Point[] = [];
  for (const p of sorted) {
    const last = uniq[uniq.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.8) uniq.push(p);
  }
  if (uniq.length <= 2) return uniq;

  const lower: Point[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = uniq.length - 1; i >= 0; i -= 1) {
    const p = uniq[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polygonCentroid(vertices: Point[]): Point {
  const n = vertices.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { ...vertices[0]! };
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const a = vertices[i]!;
    const b = vertices[j]!;
    const crossV = a.x * b.y - b.x * a.y;
    twice += crossV;
    cx += (a.x + b.x) * crossV;
    cy += (a.y + b.y) * crossV;
  }
  if (Math.abs(twice) < 1e-6) {
    let sx = 0;
    let sy = 0;
    vertices.forEach((v) => {
      sx += v.x;
      sy += v.y;
    });
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice) };
}

/** Unit normal to edge vi→vj pointing outward (away from interior toward `centroid` from edge midpoint). */
function outwardUnitNormal(vi: Point, vj: Point, centroid: Point): Point {
  const dx = vj.x - vi.x;
  const dy = vj.y - vi.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const n1 = { x: uy, y: -ux };
  const n2 = { x: -uy, y: ux };
  const mx = (vi.x + vj.x) / 2;
  const my = (vi.y + vj.y) / 2;
  const inDirX = centroid.x - mx;
  const inDirY = centroid.y - my;
  const pick = n1.x * inDirX + n1.y * inDirY < 0 ? n1 : n2;
  const plen = Math.hypot(pick.x, pick.y) || 1;
  return { x: pick.x / plen, y: pick.y / plen };
}

function lineIntersectionInfinite(a: Point, b: Point, c: Point, d: Point): Point | null {
  const x1 = a.x;
  const y1 = a.y;
  const x2 = b.x;
  const y2 = b.y;
  const x3 = c.x;
  const y3 = c.y;
  const x4 = d.x;
  const y4 = d.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function polygonSignedArea(vertices: Point[]): number {
  let a = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    a += vertices[i]!.x * vertices[j]!.y - vertices[j]!.x * vertices[i]!.y;
  }
  return a / 2;
}

/** Parallel outward offset of each edge by distance `d` (convex hull, CCW / positive signed area). */
function offsetConvexPolygon(hull: Point[], d: number): Point[] {
  const n = hull.length;
  if (n < 3) return hull.map((p) => ({ ...p }));
  const c = polygonCentroid(hull);
  const out: Point[] = [];
  for (let i = 0; i < n; i += 1) {
    const iPrev = (i - 1 + n) % n;
    const iCurr = i;
    const iNext = (i + 1) % n;
    const A = hull[iPrev]!;
    const B = hull[iCurr]!;
    const C = hull[iCurr]!;
    const D = hull[iNext]!;
    const nAB = outwardUnitNormal(A, B, c);
    const nCD = outwardUnitNormal(C, D, c);
    const p1a = { x: A.x + nAB.x * d, y: A.y + nAB.y * d };
    const p1b = { x: B.x + nAB.x * d, y: B.y + nAB.y * d };
    const p2a = { x: C.x + nCD.x * d, y: C.y + nCD.y * d };
    const p2b = { x: D.x + nCD.x * d, y: D.y + nCD.y * d };
    const inter = lineIntersectionInfinite(p1a, p1b, p2a, p2b);
    if (inter) out.push(inter);
  }
  if (out.length !== n) {
    return hull.map((v) => {
      const ux = v.x - c.x;
      const uy = v.y - c.y;
      const ul = Math.hypot(ux, uy) || 1;
      return { x: v.x + (ux / ul) * d, y: v.y + (uy / ul) * d };
    });
  }
  return out;
}

/** Thick segment as 4 corners (offset `d` from line). */
function segmentAsPolygon(p: Point, q: Point, halfWidth: number): Point[] {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfWidth;
  const ny = (dx / len) * halfWidth;
  return [
    { x: p.x + nx, y: p.y + ny },
    { x: q.x + nx, y: q.y + ny },
    { x: q.x - nx, y: q.y - ny },
    { x: p.x - nx, y: p.y - ny },
  ];
}

function pointsAttr(vertices: Point[]): string {
  return vertices.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(" ");
}

function collectLimbPoints(input: LimbBackdropBoundsInput): Point[] {
  const pts: Point[] = [];
  /** Fewer samples → tighter convex hull (less “inflated” wrap around curved threads). */
  const sampleCount = 12;

  let tLimbStart = 0;
  if (input.branchForkTs.length > 0) {
    const innermost = Math.min(...input.branchForkTs);
    tLimbStart = Math.max(0, innermost - 0.045);
  }
  const tLimbEnd =
    input.forkSpec != null && isHubGatewayLayout(input.forkSpec) ? 0.84 : 1;
  samplePathCenters(pts, input.limbPath, tLimbStart, tLimbEnd, sampleCount);

  for (const row of input.branches) {
    const kFork = row.kFork;
    const limbSegT0 = kFork <= 0 ? 0 : input.branchForkTs[input.sortedBranchIdx[kFork - 1]!]!;
    const limbSegT1 = input.branchForkTs[row.idx] ?? 0;
    const limbSegPath =
      input.forkSpec != null && limbSegT1 > limbSegT0 + 1e-9
        ? limbPathBetweenGlobalT(input.forkSpec, limbSegT0, limbSegT1)
        : "";

    if (limbSegPath) {
      samplePathCenters(pts, limbSegPath, 0, 1, sampleCount);
    }

    samplePathCenters(pts, row.threadMainDraw, 0, 1, sampleCount);

    if (!TREE_THREAD_MARKER_VISUALS_ENABLED) continue;

    if (input.showMarksByZoom) {
      const treeMoments = pickThreadMomentsForTree(row.thread.moments, TREE_THREAD_VISIBLE_MOMENTS);
      const threadForTree: DomainHubData = { ...row.thread, moments: treeMoments };
      threadForTree.moments.forEach((moment, momentIdx) => {
        const pos = resolvedChainMomentPos(
          input.areaId,
          row.idx,
          threadForTree,
          momentIdx,
          row.threadCatalogFull,
          input.momentPositions,
          row.momentChordTEnd,
        );
        pushDiscBoundary(pts, pos.x, pos.y, momentBoundsRadius(moment));
      });
    }

  }

  return pts;
}

/**
 * Convex hull of limb-visible points (same sources as the old AABB), then each edge offset outward
 * by {@link LIMB_BACKDROP_PAD_PX}. Trunk is backdrop-only — hull samples may overlap the column.
 */
export function computeLimbBackdropHull(input: LimbBackdropBoundsInput): LimbBackdropHull | null {
  const pts = collectLimbPoints(input);
  if (pts.length === 0) return null;

  const d = LIMB_BACKDROP_PAD_PX;

  if (pts.length === 1) {
    const c = pts[0]!;
    const r = Math.max(d, 6);
    const square: Point[] = [
      { x: c.x - r, y: c.y - r },
      { x: c.x + r, y: c.y - r },
      { x: c.x + r, y: c.y + r },
      { x: c.x - r, y: c.y + r },
    ];
    const centroid = polygonCentroid(square);
    return { pointsAttr: pointsAttr(square), vertices: square, centroid };
  }

  if (pts.length === 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    const quad = segmentAsPolygon(a, b, Math.max(d, 5));
    const centroid = polygonCentroid(quad);
    return { pointsAttr: pointsAttr(quad), vertices: quad, centroid };
  }

  let hull = convexHullMonotoneChain(pts);
  if (hull.length >= 3 && polygonSignedArea(hull) < 0) {
    hull.reverse();
  }
  if (hull.length < 3) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = Math.max(d, 4);
    hull = [
      { x: minX - pad, y: minY - pad },
      { x: maxX + pad, y: minY - pad },
      { x: maxX + pad, y: maxY + pad },
      { x: minX - pad, y: maxY + pad },
    ];
  }

  const centroid = polygonCentroid(hull);
  let padded = offsetConvexPolygon(hull, d);
  if (padded.length < 3) return null;
  if (polygonSignedArea(padded) < 0) padded = padded.slice().reverse();

  if (LIMB_BACKDROP_EDGE_PULLBACK_PX > 1e-6) {
    const pulled = offsetConvexPolygon(padded, -LIMB_BACKDROP_EDGE_PULLBACK_PX);
    if (pulled.length >= 3 && polygonSignedArea(pulled) > 1e-3) {
      padded = polygonSignedArea(pulled) < 0 ? pulled.slice().reverse() : pulled;
    }
  }

  const c2 = polygonCentroid(padded);
  return {
    pointsAttr: pointsAttr(padded),
    vertices: padded,
    centroid: c2,
  };
}
