import type { AreaForkSpec, BranchForkSpec, CubicPiece } from "./tree-forks";
import {
  branchMainPathBetweenGlobalT,
  branchMainPathUntilGlobalT,
  connectiveBowCubicPiece,
  isHubGatewayLayout,
  pathFromStart,
} from "./tree-forks";
import type { AreaLayoutOverride } from "./tree-layout-edit";
import type { DomainHubData, Point, TreeGoalNode } from "./tree-types";
import { shouldDomainClusterThread } from "./tree-renderer-grammar";
import { FLAGS } from "@/lib/flags";
import { THEME_STAR_CENTER } from "./tree-area-anchors";
import {
  BRANCH_T_PAST_LAST_MOMENT,
  DOMAIN_CLUSTER_BASE_RADIUS_PX,
  DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX,
  DOMAIN_CLUSTER_GOAL_RING_PHASE_OFFSET_RAD,
  DOMAIN_CLUSTER_HUB_RADIAL_MAX_FRACTION_OF_CHORD,
  DOMAIN_CLUSTER_HUB_RADIAL_MIN_PX,
  DOMAIN_CLUSTER_HUB_RADIAL_RING_PX,
  DOMAIN_CLUSTER_HUB_GATEWAY_ARC_SPREAD_PX,
  DOMAIN_CLUSTER_HUB_SLOT_RADIAL_OFFSETS_PX_N4,
  DOMAIN_CLUSTER_HUB_SLOT_RADIAL_SPREAD_PX,
  DOMAIN_CLUSTER_ICON_STROKE_INSET_PX,
  DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_FLOOR_MUL,
  DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_PER_EXTRA,
  DOMAIN_CLUSTER_STROKE_TIP_CAP,
  ROOT_GOAL_CATALOG_T_APPEND_MAX,
  ROOT_GOAL_CATALOG_T_CAP,
  ROOT_GOAL_CATALOG_T_FIRST,
  ROOT_GOAL_CATALOG_TAIL_STEP,
  ROOT_GOAL_CATALOG_T_STEP,
  ROOT_GOAL_LATERAL_ALT_FAR_MUL,
  ROOT_GOAL_LATERAL_ALT_NEAR_MUL,
  MOMENT_ARC_GAP_STRETCH,
  MOMENT_ARC_LAYOUT_REVISION,
  MOMENT_ARC_STATION_CACHE_MAX,
  MOMENT_SINGLE_RAW_T,
  MOMENT_STATION_T_HI,
  MOMENT_STATION_T_LO,
  THREAD_GLOBAL_SHORTEN,
  GOAL_BRANCH_STROKE_GAP_INSET_FROM_GOAL_CENTER_PX,
  GOAL_THREAD_STROKE_KNOT_TOWARD_SCREEN_01,
  TREE_EVOLVED_GOAL_SPAWN_ALONG_BASE_PX,
  TREE_EVOLVED_GOAL_SPAWN_ALONG_PER_DEPTH_PX,
  TREE_EVOLVED_GOAL_SPAWN_ALONG_PER_SIBLING_PX,
  TREE_EVOLVED_GOAL_SPAWN_LATERAL_BASE_PX,
  TREE_EVOLVED_GOAL_SPAWN_LATERAL_PER_SIBLING_PX,
  TREE_GOAL_BRANCH_STROKE_GAP_RADIUS_PX,
  TREE_GOAL_MAX_CHILDREN_PER_NODE,
  TREE_GOAL_RENDER_MAX_DEPTH,
} from "./tree-view-constants";

export function pickThreadMomentsForTree<T>(items: T[], maxVisible: number): T[] {
  const n = items.length;
  if (n === 0 || maxVisible <= 0) return [];
  if (n <= maxVisible) return items.slice();
  const out: T[] = [];
  const maxIdx = maxVisible - 1;
  for (let i = 0; i < maxVisible; i += 1) {
    const j = maxIdx === 0 ? 0 : Math.floor((i * (n - 1)) / maxIdx);
    out.push(items[j]!);
  }
  return out;
}

/**
 * Catalog `t` along the branch fork→tip for root goal `goalIndex` (0-based). Append-only: indices do
 * not shift when new goals are added, so existing goals stay fixed in space; the stroke extends toward
 * {@link nextAutoGoalCatalogT}.
 *
 * Indices whose linear slot would exceed {@link ROOT_GOAL_CATALOG_T_CAP} continue in small steps toward
 * {@link ROOT_GOAL_CATALOG_T_APPEND_MAX} so multiple late goals are not pinned to one `t`.
 */
export function rootGoalCatalogT(goalIndex: number): number {
  if (goalIndex < 0) return Math.max(0.04, ROOT_GOAL_CATALOG_T_FIRST);
  const raw = ROOT_GOAL_CATALOG_T_FIRST + goalIndex * ROOT_GOAL_CATALOG_T_STEP;
  if (raw <= ROOT_GOAL_CATALOG_T_CAP) {
    return Math.max(0.04, raw);
  }
  const span = ROOT_GOAL_CATALOG_T_CAP - ROOT_GOAL_CATALOG_T_FIRST;
  const iFirst = Math.floor(span / ROOT_GOAL_CATALOG_T_STEP) + 1;
  const overflow = goalIndex - iFirst;
  const t = ROOT_GOAL_CATALOG_T_CAP + Math.max(0, overflow) * ROOT_GOAL_CATALOG_TAIL_STEP;
  return Math.min(ROOT_GOAL_CATALOG_T_APPEND_MAX, Math.max(ROOT_GOAL_CATALOG_T_CAP, t));
}

export function goalTAlongThread(_goal: TreeGoalNode, index: number, _totalGoalCount: number): number {
  return rootGoalCatalogT(index);
}

/** Catalog `t` for the next goal placeholder (one slot past the last existing root goal). */
export function nextAutoGoalCatalogT(existingGoals: TreeGoalNode[]): number {
  const n = existingGoals.length;
  return Math.max(0, Math.min(1, rootGoalCatalogT(n)));
}

export function furthestRootGoalCatalogT(goals: TreeGoalNode[]): number {
  if (goals.length === 0) return 0;
  return rootGoalCatalogT(goals.length - 1);
}

export function branchGuideStationTs(thread: DomainHubData, nextGoalSlotT: number): number[] {
  const ts: number[] = [0];
  thread.goals.forEach((g, gi) => {
    ts.push(goalTAlongThread(g, gi, thread.goals.length));
  });
  ts.push(Math.min(1, Math.max(0, nextGoalSlotT)));
  ts.sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const raw of ts) {
    const t = Math.min(1, Math.max(0, raw));
    if (uniq.length === 0 || Math.abs(uniq[uniq.length - 1]! - t) > 1e-5) uniq.push(t);
  }
  return uniq;
}

function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function splitCubicPieceLeft(p0: Point, seg: CubicPiece, t: number): CubicPiece {
  const { c1: p1, c2: p2, end: p3 } = seg;
  const q01 = lerpPt(p0, p1, t);
  const q11 = lerpPt(p1, p2, t);
  const q21 = lerpPt(p2, p3, t);
  const q02 = lerpPt(q01, q11, t);
  const q12 = lerpPt(q11, q21, t);
  const q03 = lerpPt(q02, q12, t);
  return { c1: q01, c2: q02, end: q03 };
}

function slotPathUntilGlobalT(pathD: string, globalTEnd: number): string {
  const segments = parseCubicPath(pathD);
  if (segments.length === 0) return pathD;
  const fork = segments[0].p0;
  const pieces: CubicPiece[] = segments.map((s) => ({ c1: s.p1, c2: s.p2, end: s.p3 }));
  const n = pieces.length;
  const clamped = Math.max(0, Math.min(1, globalTEnd));
  const tn = clamped * n;
  if (tn >= n - 1e-9) return pathD;
  const segIndex = Math.min(n - 1, Math.floor(tn));
  const localT = tn - segIndex;
  const piecesOut: CubicPiece[] = [];
  for (let i = 0; i < segIndex; i += 1) piecesOut.push(pieces[i]!);
  const p0 = segIndex === 0 ? fork : pieces[segIndex - 1]!.end;
  const seg = pieces[segIndex]!;
  const lt = Math.max(1e-9, Math.min(1, localT));
  piecesOut.push(splitCubicPieceLeft(p0, seg, lt));
  return pathFromStart(fork, piecesOut);
}

/** Catalog fork→tip subpath between uniform-global `t0` and `t1` (slot path or {@link BranchForkSpec}). */
export function threadCatalogPathBetweenGlobalT(
  threadSpec: BranchForkSpec | undefined,
  threadSlotPath: string,
  t0: number,
  t1: number,
): string {
  if (t1 <= t0 + 1e-9) return "";
  if (threadSpec != null) {
    return branchMainPathBetweenGlobalT(threadSpec, t0, t1);
  }
  const segments = parseCubicPath(threadSlotPath);
  if (segments.length === 0) return "";
  const fork = segments[0].p0;
  const branchPieces: CubicPiece[] = segments.map((s) => ({ c1: s.p1, c2: s.p2, end: s.p3 }));
  const tip = branchPieces[branchPieces.length - 1]!.end;
  return branchMainPathBetweenGlobalT(
    { forkPoint: fork, tip, branchPieces, strokeWidth: 1 },
    t0,
    t1,
  );
}

export function getOpacity(focused: string | null, limbId: string): number {
  return !focused || focused === limbId ? 1 : 0.42;
}

type CubicSegment = { p0: Point; p1: Point; p2: Point; p3: Point };

function parseCubicPath(path: string): CubicSegment[] {
  const nums = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length < 8) return [];
  let cursor: Point = { x: nums[0], y: nums[1] };
  const segments: CubicSegment[] = [];
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const seg: CubicSegment = {
      p0: cursor,
      p1: { x: nums[i], y: nums[i + 1] },
      p2: { x: nums[i + 2], y: nums[i + 3] },
      p3: { x: nums[i + 4], y: nums[i + 5] },
    };
    segments.push(seg);
    cursor = seg.p3;
  }
  return segments;
}

function cubicPoint(t: number, s: CubicSegment): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * s.p0.x + 3 * mt ** 2 * t * s.p1.x + 3 * mt * t ** 2 * s.p2.x + t ** 3 * s.p3.x,
    y: mt ** 3 * s.p0.y + 3 * mt ** 2 * t * s.p1.y + 3 * mt * t ** 2 * s.p2.y + t ** 3 * s.p3.y,
  };
}

function cubicTangent(t: number, s: CubicSegment): Point {
  const mt = 1 - t;
  const x =
    3 * mt ** 2 * (s.p1.x - s.p0.x) + 6 * mt * t * (s.p2.x - s.p1.x) + 3 * t ** 2 * (s.p3.x - s.p2.x);
  const y =
    3 * mt ** 2 * (s.p1.y - s.p0.y) + 6 * mt * t * (s.p2.y - s.p1.y) + 3 * t ** 2 * (s.p3.y - s.p2.y);
  return { x, y };
}

/** Rotation (radians) so the hex “top” vertex sits on the incoming catalog branch direction (−tangent). */
export function goalHexRotationRadFromTangentOut(tangentOut: Point): number {
  const len = Math.hypot(tangentOut.x, tangentOut.y);
  if (len < 1e-12) return 0;
  const inx = -tangentOut.x / len;
  const iny = -tangentOut.y / len;
  return Math.atan2(iny, inx) + Math.PI / 2;
}

/** `u` ∈ (0, 1) where segment AB crosses the circle boundary |P − center| = radius (transversal roots only). */
function segmentCircleOpenCrossingParams(a: Point, b: Point, center: Point, radius: number): number[] {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const wx = a.x - center.x;
  const wy = a.y - center.y;
  const A = ux * ux + uy * uy;
  const B = 2 * (ux * wx + uy * wy);
  const rSq = radius * radius;
  const Ccoef = wx * wx + wy * wy - rSq;
  if (A < 1e-14) return [];
  const disc = B * B - 4 * A * Ccoef;
  if (disc < 1e-10) return [];
  const sqrtD = Math.sqrt(disc);
  const u1 = (-B - sqrtD) / (2 * A);
  const u2 = (-B + sqrtD) / (2 * A);
  const eps = 1e-7;
  const raw: number[] = [];
  for (const u of [u1, u2]) {
    if (u > eps && u < 1 - eps) raw.push(u);
  }
  raw.sort((x, y) => x - y);
  const out: number[] = [];
  for (const u of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && Math.abs(u - prev) < 1e-5) continue;
    out.push(u);
  }
  return out;
}

function diskInsideAlphaIntervals(pts: Point[], center: Point, radius: number): { a0: number; a1: number }[] {
  const n = pts.length;
  if (n < 2) return [];
  const rSq = radius * radius;
  const d2 = (p: Point) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return dx * dx + dy * dy;
  };

  const crossings: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    for (const u of segmentCircleOpenCrossingParams(a, b, center, radius)) {
      crossings.push(i + u);
    }
  }
  crossings.sort((x, y) => x - y);
  const deduped: number[] = [];
  for (const c of crossings) {
    const prev = deduped[deduped.length - 1];
    if (prev !== undefined && Math.abs(c - prev) < 1e-5) continue;
    deduped.push(c);
  }

  let inside = d2(pts[0]!) <= rSq + 1e-6;
  let start: number | null = inside ? 0 : null;
  const intervals: { a0: number; a1: number }[] = [];
  const maxA = n - 1;

  for (const c of deduped) {
    if (inside) {
      if (start !== null) intervals.push({ a0: start, a1: c });
      start = null;
      inside = false;
    } else {
      start = c;
      inside = true;
    }
  }
  if (inside && start !== null) intervals.push({ a0: start, a1: maxA });

  return intervals;
}

function pointAtPolylineAlpha(pts: Point[], alpha: number): Point {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return pts[0]!;
  const maxA = n - 1;
  if (alpha <= 0) return pts[0]!;
  if (alpha >= maxA) return pts[n - 1]!;
  const seg = Math.min(n - 2, Math.max(0, Math.floor(alpha)));
  const u = alpha - seg;
  const pa = pts[seg]!;
  const pb = pts[seg + 1]!;
  return { x: pa.x + u * (pb.x - pa.x), y: pa.y + u * (pb.y - pa.y) };
}

function collectPolylineSpanPoints(pts: Point[], alphaFrom: number, alphaTo: number): Point[] {
  if (alphaTo < alphaFrom - 1e-9) return [];
  const out: Point[] = [];
  out.push(pointAtPolylineAlpha(pts, alphaFrom));
  let k = Math.ceil(alphaFrom + 1e-9);
  const lastIdx = pts.length - 1;
  while (k < alphaTo - 1e-9 && k <= lastIdx) {
    out.push(pts[k]!);
    k += 1;
  }
  const endPt = pointAtPolylineAlpha(pts, alphaTo);
  const prev = out[out.length - 1]!;
  if (Math.hypot(endPt.x - prev.x, endPt.y - prev.y) > 1e-6) out.push(endPt);
  return out;
}

/** Open uniform Catmull–Rom → cubic Bézier (matches trunk closed helper, without `Z`). */
function openSmoothCurveThroughPolyline(pts: Point[]): string {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    return `M${a.x},${a.y} L${b.x},${b.y}`;
  }
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = i === 0 ? pts[0]! : pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = i + 2 < n ? pts[i + 2]! : pts[i + 1]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function sampleStrokePathToPolyline(pathD: string, subdivPerSegment: number): Point[] {
  const segs = parseCubicPath(pathD);
  if (segs.length === 0) return [];
  const pts: Point[] = [];
  const n = Math.max(3, subdivPerSegment);
  for (let si = 0; si < segs.length; si += 1) {
    const s = segs[si]!;
    for (let k = 0; k <= n; k += 1) {
      const p = cubicPoint(k / n, s);
      const prev = pts[pts.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6) pts.push(p);
    }
  }
  return pts;
}

export type GoalBranchStrokeGapSpec = { center: Point };

/**
 * Solid thread stroke only: remove each polyline span that lies within `gapRadius` px of a goal centre
 * (circular gap around the anchor dot).
 *
 * Visible spans are re-drawn as **smooth cubic** chains through dense samples (not jaggy `L` polylines).
 */
export function applyGoalCircleGapsToStrokePath(
  strokePathD: string,
  goalSpecs: GoalBranchStrokeGapSpec[],
  gapRadius: number,
): string {
  if (goalSpecs.length === 0) return strokePathD;
  /** Sample density before Catmull→cubic smoothing around goal holes. */
  const pts = sampleStrokePathToPolyline(strokePathD, 60);
  if (pts.length < 2) return strokePathD;

  type Cut = { a0: number; a1: number };
  const cuts: Cut[] = [];
  for (const spec of goalSpecs) {
    for (const range of diskInsideAlphaIntervals(pts, spec.center, gapRadius)) {
      cuts.push(range);
    }
  }
  if (cuts.length === 0) return strokePathD;

  cuts.sort((a, b) => a.a0 - b.a0);
  const merged: Cut[] = [];
  for (const c of cuts) {
    const prev = merged[merged.length - 1];
    if (prev && c.a0 <= prev.a1 + 2e-4) prev.a1 = Math.max(prev.a1, c.a1);
    else merged.push({ ...c });
  }

  let d = "";
  const emitPts = (chunk: Point[]) => {
    if (chunk.length < 2) return;
    const smooth = openSmoothCurveThroughPolyline(chunk);
    if (!smooth) return;
    d += smooth;
  };

  let cursor = 0;
  const maxA = pts.length - 1;
  for (const cut of merged) {
    const a0 = Math.max(0, cut.a0);
    const a1 = Math.min(maxA, cut.a1);
    if (a1 < cursor - 1e-9) continue;
    const from = Math.max(cursor, 0);
    const toEntry = Math.min(a0, maxA);
    if (toEntry > from + 1e-9) emitPts(collectPolylineSpanPoints(pts, from, toEntry));
    const pExit = pointAtPolylineAlpha(pts, a1);
    d += ` M${pExit.x},${pExit.y}`;
    cursor = a1;
  }
  if (maxA > cursor + 1e-9) emitPts(collectPolylineSpanPoints(pts, cursor, maxA));

  return d || strokePathD;
}

function pathPointAtTSegments(segments: CubicSegment[], t: number): Point {
  if (segments.length === 0) return { x: 0, y: 0 };
  const clamped = Math.max(0, Math.min(0.999999, t));
  const segIndex = Math.min(segments.length - 1, Math.floor(clamped * segments.length));
  const localT = clamped * segments.length - segIndex;
  return cubicPoint(localT, segments[segIndex]);
}

export function pathPointAtT(path: string, t: number): Point {
  return pathPointAtTSegments(parseCubicPath(path), t);
}

function pathTangentAtTSegments(segments: CubicSegment[], t: number): Point {
  if (segments.length === 0) return { x: 1, y: 0 };
  const clamped = Math.max(0, Math.min(0.999999, t));
  const segIndex = Math.min(segments.length - 1, Math.floor(clamped * segments.length));
  const localT = clamped * segments.length - segIndex;
  return cubicTangent(localT, segments[segIndex]!);
}

/** Derivative of the cubic path with respect to uniform global `t` (same segmentation as {@link pathPointAtT}). */
export function pathTangentAtT(path: string, t: number): Point {
  return pathTangentAtTSegments(parseCubicPath(path), t);
}

/**
 * Open polyline approximating `path` between uniform-global `t0`…`t1` (inclusive endpoints).
 * Render-only aid (bole film, warm emergence); does not alter fork routing or catalog geometry.
 */
export function polylinePathApproxBetweenT(
  path: string,
  t0: number,
  t1: number,
  samples: number,
): string {
  if (!path || t1 <= t0 + 1e-9) return "";
  const ta = Math.max(0, Math.min(1, t0));
  const tb = Math.max(ta, Math.min(1, t1));
  const n = Math.max(2, Math.min(48, Math.floor(samples)));
  const p0 = pathPointAtT(path, ta);
  let d = `M${p0.x},${p0.y}`;
  for (let i = 1; i <= n; i += 1) {
    const u = ta + ((tb - ta) * i) / n;
    const p = pathPointAtT(path, u);
    d += ` L${p.x},${p.y}`;
  }
  return d;
}

/**
 * How far the stroke has “opened” from the compressed emergence band (0 = still bole-adjacent, 1 = developed).
 * Polyline length along the first ~13% of uniform `t`, damped when tangents kink (sharp bends read as one ribbon).
 * Drives soft underlay width/opacity only — core stroke stays full authority.
 */
export function branchPathEmergenceRelax01(pathD: string): number {
  if (!pathD || pathD.length < 8) return 0;
  const ts = [0, 0.032, 0.068, 0.13] as const;
  let len = 0;
  for (let i = 1; i < ts.length; i += 1) {
    const a = pathPointAtT(pathD, ts[i - 1]!);
    const b = pathPointAtT(pathD, ts[i]!);
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const relaxLen = Math.min(1, len / 36);
  const tan0 = pathTangentAtT(pathD, 0.02);
  const tan1 = pathTangentAtT(pathD, 0.11);
  const l0 = Math.hypot(tan0.x, tan0.y) || 1;
  const l1 = Math.hypot(tan1.x, tan1.y) || 1;
  const dot = (tan0.x * tan1.x + tan0.y * tan1.y) / (l0 * l1);
  const bendSoft = Math.min(1, Math.max(0.36, 0.36 + (dot + 0.08) * 0.62));
  return relaxLen * bendSoft;
}

/**
 * Point at fraction `u` ∈ [0, 1] of total **arc length** of `path` (uniform samples in path parameter).
 * Spreads goals evenly in screen space along curved threads; uniform `t` bunches when many goals share one thread.
 */
export function pathPointAtUniformArcFraction(path: string, u: number): Point {
  const segments = parseCubicPath(path);
  if (segments.length === 0) return pathPointAtT(path, Math.max(0, Math.min(1, u)));
  const samples = Math.min(384, Math.max(96, 48 * segments.length));
  const poly = polylineAlongGlobalTSegment(segments, 0, 0.999999, samples);
  const total = poly.cum[poly.cum.length - 1] ?? 0;
  if (total < 1e-9) return pathPointAtT(path, u);
  const clampedU = Math.max(0, Math.min(1, u));
  const s = clampedU * total;
  const t = globalTAtArcAlongPolyline(poly.ts, poly.cum, s);
  return pathPointAtT(path, t);
}

/** Deterministic layout salt so goals on the same thread (e.g. Income) don’t share one rail. */
function stableGoalLayoutSalt(goalId: string): { phase: number; magBump: number } {
  let h = 2166136261;
  for (let i = 0; i < goalId.length; i += 1) {
    h ^= goalId.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return {
    /** ~0…2π from id — kept bounded; blend factor dampens on use so neighbors don’t jump erratically. */
    phase: (u % 628) / 100,
    magBump: ((u >>> 10) % 11) * 0.62,
  };
}

/**
 * Unit signed distance from the median slot in `[−1, 1]` (0 when `n ≤ 1`). Shared by radial and
 * gateway-arc stratification ladders.
 */
function domainClusterHubSlotSignedUnitFromMedian(slot: number, n: number): number {
  if (n <= 1) return 0;
  const median = (n - 1) / 2;
  return (median - slot) / median;
}

/**
 * For **hub gateway** layout (all branch forks at {@link AreaForkSpec.limbTip}), unit vector
 * tangent to the nominal “ring” around the gateway — perpendicular to the first hub spoke when
 * there is no trunk→gateway segment (degenerate stem).
 */
export function domainClusterGatewaySpreadNormalForForkSpec(
  forkSpec: AreaForkSpec | undefined,
): Point | undefined {
  if (!forkSpec || !isHubGatewayLayout(forkSpec)) return undefined;
  const dx = forkSpec.limbTip.x - forkSpec.trunkAttach.x;
  const dy = forkSpec.limbTip.y - forkSpec.trunkAttach.y;
  const len = Math.hypot(dx, dy);
  if (len >= 1e-4) {
    const ux = dx / len;
    const uy = dy / len;
    return { x: -uy, y: ux };
  }
  const br0 = forkSpec.branches[0];
  if (!br0) return undefined;
  const bx = br0.tip.x - br0.forkPoint.x;
  const by = br0.tip.y - br0.forkPoint.y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-4) return undefined;
  const ux = bx / blen;
  const uy = by / blen;
  return { x: -uy, y: ux };
}

/**
 * Outward unit from the branch fork along increasing catalog parameter — never points “back” into
 * the parent stem: it is aligned with fork→early-sample on the authored branch. This is the
 * canonical **branch direction** in the hub-centric model: it owns the wedge the hub anchors into
 * and determines the perpendicular axis used for goal rings and sibling-label stagger.
 */
function domainClusterBranchOutwardUnit(catalogFullPath: string): { fork: Point; outward: Point } {
  if (catalogFullPath.length < 8) {
    return { fork: pathPointAtT(catalogFullPath, 0), outward: { x: 1, y: 0 } };
  }
  const fork = pathPointAtT(catalogFullPath, 0);
  const tProbe = Math.min(0.22, Math.max(0.06, DOMAIN_CLUSTER_STROKE_TIP_CAP * 0.42));
  const pProbe = pathPointAtT(catalogFullPath, tProbe);
  let dx = pProbe.x - fork.x;
  let dy = pProbe.y - fork.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-4) {
    const tau = pathTangentAtT(catalogFullPath, 0.03);
    len = Math.hypot(tau.x, tau.y) || 1;
    return { fork, outward: { x: tau.x / len, y: tau.y / len } };
  }
  return { fork, outward: { x: dx / len, y: dy / len } };
}

/**
 * Slot-based radial offset around {@link DOMAIN_CLUSTER_HUB_RADIAL_RING_PX}. For four hubs, values
 * come from {@link DOMAIN_CLUSTER_HUB_SLOT_RADIAL_OFFSETS_PX_N4} (uniform zeros in the default layout).
 * Six-hub Health & Body uses the same uniform ring; other counts use a linear ladder.
 */
function domainClusterHubSlotRadialOffsetPx(slot: number, n: number): number {
  if (n === 4 && slot >= 0 && slot < 4) {
    return DOMAIN_CLUSTER_HUB_SLOT_RADIAL_OFFSETS_PX_N4[slot]!;
  }
  if (n === 6) {
    return 0;
  }
  return domainClusterHubSlotSignedUnitFromMedian(slot, n) * DOMAIN_CLUSTER_HUB_SLOT_RADIAL_SPREAD_PX;
}

/** Gateway-arc stratification (px) — same slot ladder as radial, orthogonal axis (see {@link domainClusterGatewaySpreadNormalForForkSpec}). */
function domainClusterHubSlotGatewayArcOffsetPx(slot: number, n: number): number {
  if (n === 6) {
    return 0;
  }
  return domainClusterHubSlotSignedUnitFromMedian(slot, n) * DOMAIN_CLUSTER_HUB_GATEWAY_ARC_SPREAD_PX;
}

/**
 * Count-driven orbital ring shrink — more siblings on a limb pack adjacent hubs closer, so the
 * per-hub goal ring tightens by a small, deterministic multiplier. No neighbor-distance probing,
 * no force balancing.
 */
function domainClusterOrbitalRingNeighborMul(branchCountOnLimb: number): number {
  const extra = Math.max(0, (branchCountOnLimb | 0) - 2);
  return Math.max(
    DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_FLOOR_MUL,
    1 - extra * DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_PER_EXTRA,
  );
}

/**
 * Public accessor for the branch outward unit — the canonical direction used for hub anchoring,
 * goal-ring orientation, and sibling-label stagger. Returns `{ x: 1, y: 0 }` for degenerate paths.
 */
export function domainClusterBranchOutwardFromCatalog(catalogFullPath: string): Point {
  return domainClusterBranchOutwardUnit(catalogFullPath).outward;
}

/**
 * Domain hub screen anchor: **fork + shared radial depth** along the branch outward direction, with
 * a small slot-based radial stratification ({@link domainClusterHubSlotRadialOffsetPx}) so adjacent
 * hubs don’t pile onto one orbital shell. On **hub** limbs, optional `gatewaySpreadNormal` adds a
 * second ladder along the gateway tangent (see {@link domainClusterGatewaySpreadNormalForForkSpec})
 * so sibling hubs fan around the gateway when every branch shares the same fork point. The hub is a
 * **semantic center**, not a point on the spline — the authored catalog is only sampled to derive
 * `outward` (branch direction) and to size the safe reach against the fork→tip chord. Conduits adapt
 * to the hub in {@link buildRenderedBranchMainPath}.
 */
export function domainClusterHubAnchorFromCatalog(
  catalogFullPath: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  gatewaySpreadNormal?: Point,
): Point {
  if (catalogFullPath.length < 8) return pathPointAtT(catalogFullPath, 0);
  const { fork, outward } = domainClusterBranchOutwardUnit(catalogFullPath);
  const tipSample = pathPointAtT(catalogFullPath, DOMAIN_CLUSTER_STROKE_TIP_CAP);
  const chordLen = Math.hypot(tipSample.x - fork.x, tipSample.y - fork.y);
  const slotOffset = domainClusterHubSlotRadialOffsetPx(threadIndexAlongLimb, branchCountOnLimb);
  const targetR = DOMAIN_CLUSTER_HUB_RADIAL_RING_PX + slotOffset;
  const maxReach = Math.max(DOMAIN_CLUSTER_HUB_RADIAL_MIN_PX + 8, chordLen);
  const R = Math.max(
    DOMAIN_CLUSTER_HUB_RADIAL_MIN_PX,
    Math.min(targetR, maxReach * DOMAIN_CLUSTER_HUB_RADIAL_MAX_FRACTION_OF_CHORD),
  );
  let x = fork.x + outward.x * R;
  let y = fork.y + outward.y * R;
  if (gatewaySpreadNormal) {
    const gl = Math.hypot(gatewaySpreadNormal.x, gatewaySpreadNormal.y);
    if (gl > 1e-4) {
      const nx = gatewaySpreadNormal.x / gl;
      const ny = gatewaySpreadNormal.y / gl;
      const arc = domainClusterHubSlotGatewayArcOffsetPx(threadIndexAlongLimb, branchCountOnLimb);
      x += nx * arc;
      y += ny * arc;
    }
  }
  return { x, y };
}

/**
 * Root goals on a **domain cluster** thread: equal 360° placement on a ring around the hub in the
 * branch outward × perpendicular frame. No ecology-driven polar stretch, no per-area variance —
 * the hub owns the local territory and the ring is a pure composition primitive.
 */
export function goalScreenPositionDomainCluster(
  catalogPath: string,
  goalIndex: number,
  goalId: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  goalsOnThreadCount: number,
  gatewaySpreadNormal?: Point,
): Point {
  if (catalogPath.length < 8) return pathPointAtT(catalogPath, 0);
  const hub = domainClusterHubAnchorFromCatalog(
    catalogPath,
    threadIndexAlongLimb,
    branchCountOnLimb,
    gatewaySpreadNormal,
  );
  const { outward } = domainClusterBranchOutwardUnit(catalogPath);
  const uDir = outward;
  const v = { x: -uDir.y, y: uDir.x };
  const nGoals = Math.max(1, goalsOnThreadCount);
  /**
   * Equal angles on a **full 360°** ring in the hub tangent–normal plane — low goal counts (e.g. 4) spread
   * to all quadrants instead of packing into a shallow wedge.
   */
  const theta =
    nGoals <= 1
      ? 0
      : (2 * Math.PI * goalIndex) / nGoals + DOMAIN_CLUSTER_GOAL_RING_PHASE_OFFSET_RAD;
  const { phase: idPhase, magBump } = stableGoalLayoutSalt(goalId);
  /** One tight ring; angles carry separation, with a slot-count shrink so dense limbs don't collide. */
  const ringMul = domainClusterOrbitalRingNeighborMul(branchCountOnLimb);
  let r =
    (DOMAIN_CLUSTER_BASE_RADIUS_PX + magBump * 0.34 + Math.sin((goalIndex + 1) * 0.37 + idPhase) * 1.05) *
    ringMul;
  r = Math.min(DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX * ringMul, r);
  /** True circle in the outward × perp plane (`v` ⟂ `uDir`). */
  const ox = (Math.cos(theta) * v.x + Math.sin(theta) * uDir.x) * r;
  const oy = (Math.cos(theta) * v.y + Math.sin(theta) * uDir.y) * r;
  return { x: hub.x + ox, y: hub.y + oy };
}

export function goalScreenPositionForLifeAreaThread(
  areaId: string,
  thread: DomainHubData,
  catalogPath: string,
  goalIndex: number,
  goalId: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  goalsOnThreadCount: number,
  domainClusterGatewaySpreadNormal?: Point,
): Point {
  if (shouldDomainClusterThread(areaId, thread)) {
    return goalScreenPositionDomainCluster(
      catalogPath,
      goalIndex,
      goalId,
      threadIndexAlongLimb,
      branchCountOnLimb,
      goalsOnThreadCount,
      domainClusterGatewaySpreadNormal,
    );
  }
  return goalScreenPositionOnCatalogPath(
    catalogPath,
    goalIndex,
    goalId,
    threadIndexAlongLimb,
    branchCountOnLimb,
    goalsOnThreadCount,
  );
}

function evolvedChildLayoutJitter(childId: string): number {
  let h = 2166136261;
  for (let k = 0; k < childId.length; k += 1) {
    h ^= childId.charCodeAt(k)!;
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 9) % 11) - 5) * 0.95;
}

/** Screen position for an evolved (forked) child along the hub → parent outward ray. */
export function evolvedChildScreenPosition(
  parentPt: Point,
  domainHubPt: Point,
  childIndex: number,
  childId: string,
  depth: number,
): Point {
  const dx = parentPt.x - domainHubPt.x;
  const dy = parentPt.y - domainHubPt.y;
  const rayLen = Math.hypot(dx, dy) || 1;
  const ux = dx / rayLen;
  const uy = dy / rayLen;
  const perpX = -uy;
  const perpY = ux;
  const side = childIndex % 2 === 0 ? 1 : -1;
  const lenJitter = evolvedChildLayoutJitter(childId);
  const along =
    TREE_EVOLVED_GOAL_SPAWN_ALONG_BASE_PX +
    childIndex * TREE_EVOLVED_GOAL_SPAWN_ALONG_PER_SIBLING_PX +
    depth * TREE_EVOLVED_GOAL_SPAWN_ALONG_PER_DEPTH_PX +
    lenJitter;
  const lateral =
    side * (TREE_EVOLVED_GOAL_SPAWN_LATERAL_BASE_PX + childIndex * TREE_EVOLVED_GOAL_SPAWN_LATERAL_PER_SIBLING_PX);
  return {
    x: parentPt.x + ux * along + perpX * lateral,
    y: parentPt.y + uy * along + perpY * lateral,
  };
}

export type EvolvedGoalFlowSegment = { from: Point; to: Point };

/** Parent → evolved-child flow segments (recursive for nested evolutions). */
export function evolvedGoalFlowSegments(
  parentPt: Point,
  domainHubPt: Point,
  goal: TreeGoalNode,
  depth = 0,
): EvolvedGoalFlowSegment[] {
  const segments: EvolvedGoalFlowSegment[] = [];
  const children = goal.childGoals.slice(0, TREE_GOAL_MAX_CHILDREN_PER_NODE);
  for (let ci = 0; ci < children.length; ci += 1) {
    const child = children[ci]!;
    const childPt = evolvedChildScreenPosition(parentPt, domainHubPt, ci, child.id, depth);
    segments.push({ from: parentPt, to: childPt });
    if (child.childGoals.length > 0 && depth < TREE_GOAL_RENDER_MAX_DEPTH) {
      segments.push(...evolvedGoalFlowSegments(childPt, domainHubPt, child, depth + 1));
    }
  }
  return segments;
}

/** Hub → root goal → evolved chain segments for domain-cluster flow lines. */
export function domainClusterGoalFlowSegments(
  hubPt: Point,
  goalScreenPt: Point,
  goal: TreeGoalNode,
): EvolvedGoalFlowSegment[] {
  return [
    { from: hubPt, to: goalScreenPt },
    ...evolvedGoalFlowSegments(goalScreenPt, hubPt, goal),
  ];
}

/**
 * Tangent direction for goal-hex orientation.
 *
 * Longitudinal threads: tangent of the authored catalog at the goal’s slot `t` (the goal lies on
 * the conduit and reads as a node passing through it).
 *
 * Domain-cluster threads: hub→goal radial. The hub is the semantic center; goals point *outward*
 * from it. No spline sampling — the conduit no longer carries placement semantics here.
 */
export function goalMarkerTangentOutForPlacement(
  useCluster: boolean,
  catalogPath: string,
  goalIndex: number,
  goalScreen: Point,
  clusterThreadIndex?: number,
  clusterBranchCount?: number,
  domainClusterGatewaySpreadNormal?: Point,
): Point {
  if (!useCluster || catalogPath.length < 8) {
    const tc = rootGoalCatalogT(goalIndex);
    return pathTangentAtT(catalogPath, tc);
  }
  const hub =
    clusterThreadIndex !== undefined && clusterBranchCount !== undefined
      ? domainClusterHubAnchorFromCatalog(
          catalogPath,
          clusterThreadIndex,
          clusterBranchCount,
          domainClusterGatewaySpreadNormal,
        )
      : pathPointAtT(catalogPath, 0);
  const dx = goalScreen.x - hub.x;
  const dy = goalScreen.y - hub.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Canonical domain hub screen point (see {@link domainClusterHubAnchorFromCatalog}). */
export function domainClusterHubPointFromCatalog(
  catalogFullPath: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  gatewaySpreadNormal?: Point,
): Point {
  return domainClusterHubAnchorFromCatalog(
    catalogFullPath,
    threadIndexAlongLimb,
    branchCountOnLimb,
    gatewaySpreadNormal,
  );
}

/**
 * Short hub-anchored reach (SVG units) for the add-goal placeholder in domain-cluster mode.
 * Just outside the hub ring (~17px) plus a small gap — keeps the placeholder reading as a hub
 * affordance rather than a peer in the orbital ring with existing goals.
 */
const DOMAIN_CLUSTER_ADD_GOAL_HUB_REACH_PX = 34;

/**
 * Compact placeholder anchor for domain-cluster add-goal — sits just outside the hub ring,
 * pointing toward the next polar slot, so the placeholder visually spawns from the hub instead
 * of joining the orbital ring of existing goals.
 */
export function domainClusterAddGoalPlaceholderPt(
  areaId: string,
  thread: DomainHubData,
  catalogPath: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  gatewaySpreadNormal?: Point,
): Point {
  const hub = domainClusterHubPointFromCatalog(
    catalogPath,
    threadIndexAlongLimb,
    branchCountOnLimb,
    gatewaySpreadNormal,
  );
  const n = thread.goals.length;
  const polar = goalScreenPositionForLifeAreaThread(
    areaId,
    thread,
    catalogPath,
    n,
    `${thread.id}:placeholder`,
    threadIndexAlongLimb,
    branchCountOnLimb,
    Math.max(1, n + 1),
    gatewaySpreadNormal,
  );
  const dx = polar.x - hub.x;
  const dy = polar.y - hub.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: hub.x + (dx / len) * DOMAIN_CLUSTER_ADD_GOAL_HUB_REACH_PX,
    y: hub.y + (dy / len) * DOMAIN_CLUSTER_ADD_GOAL_HUB_REACH_PX,
  };
}

/**
 * Straight connector from the **domain hub** to the add-goal placeholder (domain cluster grammar).
 * The placeholder is anchored just outside the hub ring (see
 * {@link domainClusterAddGoalPlaceholderPt}), so the tail is a short hub affordance — not a long
 * reach across the orbital ring.
 */
export function domainClusterAddGoalTailPath(
  areaId: string,
  thread: DomainHubData,
  catalogPath: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  gatewaySpreadNormal?: Point,
): string {
  if (!shouldDomainClusterThread(areaId, thread)) return "";
  const hub = domainClusterHubPointFromCatalog(
    catalogPath,
    threadIndexAlongLimb,
    branchCountOnLimb,
    gatewaySpreadNormal,
  );
  const ph = domainClusterAddGoalPlaceholderPt(
    areaId,
    thread,
    catalogPath,
    threadIndexAlongLimb,
    branchCountOnLimb,
    gatewaySpreadNormal,
  );
  return `M${hub.x},${hub.y} L${ph.x},${ph.y}`;
}

/**
 * Goal marker near the **catalog** branch at {@link rootGoalCatalogT}(`goalIndex`).
 * Coordinates stay fixed when the stroke extends for the next placeholder. `threadCatalogFull` from
 * {@link buildRenderedBranchMainPath}.
 *
 * Offsets each goal in the tangent–normal frame with phase from **index + thread + goal id**, so
 * many goals on one branch (e.g. all Income) do not read as a single straight queue from the hub —
 * even when the branch cubic is nearly straight.
 *
 * `branchCountOnLimb` / `goalsOnThreadCount` add modest breathing room when several threads share a
 * wedge — scaled lightly so same-branch distances stay coherent.
 *
 * Lateral distance from the conduit alternates **near / far** by goal index ({@link ROOT_GOAL_LATERAL_ALT_NEAR_MUL} /
 * {@link ROOT_GOAL_LATERAL_ALT_FAR_MUL}) so goals stagger in depth along the branch.
 */
export function goalScreenPositionOnCatalogPath(
  catalogPath: string,
  goalIndex: number,
  goalId: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  goalsOnThreadCount: number,
): Point {
  const t = rootGoalCatalogT(goalIndex);
  const p = pathPointAtT(catalogPath, t);
  if (catalogPath.length < 8) return p;

  const tau = pathTangentAtT(catalogPath, t);
  const len = Math.hypot(tau.x, tau.y) || 1;
  const uDir = { x: tau.x / len, y: tau.y / len };
  const v = { x: -uDir.y, y: uDir.x };
  const { phase: idPhase, magBump } = stableGoalLayoutSalt(goalId);
  const nGoals = Math.max(1, goalsOnThreadCount);
  /** 0…1 along this thread — light bias only so spacing doesn’t read chaotic. */
  const alongThread = nGoals <= 1 ? 0.35 : goalIndex / (nGoals - 1);
  const alpha =
    goalIndex * 0.58 +
    threadIndexAlongLimb * 0.88 +
    idPhase * 0.42 +
    alongThread * 0.26;
  let mag =
    25 +
    goalIndex * 4.7 +
    magBump +
    alongThread * 14 +
    Math.sin(alongThread * Math.PI) * 6;
  /** Extra lateral budget when several threads share one limb — separates goals on different conduits. */
  const threadsMul = 1 + 0.14 * Math.max(0, branchCountOnLimb - 1);
  mag *= threadsMul;
  mag = Math.min(94, mag);
  mag *= goalIndex % 2 === 0 ? ROOT_GOAL_LATERAL_ALT_NEAR_MUL : ROOT_GOAL_LATERAL_ALT_FAR_MUL;
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const ox = (c * v.x + s * uDir.x) * mag;
  const oy = (c * v.y + s * uDir.y) * mag;
  return { x: p.x + ox, y: p.y + oy };
}

export function arcLengthMomentStationSegment(path: string): number {
  const segments = parseCubicPath(path);
  if (segments.length === 0) return 0;
  const poly = polylineAlongGlobalTSegment(segments, MOMENT_STATION_T_LO, MOMENT_STATION_T_HI, 128);
  return poly.cum[poly.cum.length - 1] ?? 0;
}

/** Arc distance `arcOffset` from {@link MOMENT_STATION_T_LO} along [LO, HI], clamped to segment length. */
export function momentPositionAtArcOffsetFromStationLo(path: string, arcOffset: number): Point {
  const segments = parseCubicPath(path);
  if (segments.length === 0) return pathPointAtT(path, MOMENT_STATION_T_LO);
  const poly = polylineAlongGlobalTSegment(segments, MOMENT_STATION_T_LO, MOMENT_STATION_T_HI, 256);
  const totalArc = poly.cum[poly.cum.length - 1] ?? 0;
  const s = Math.max(0, Math.min(arcOffset, totalArc));
  const t = globalTAtArcAlongPolyline(poly.ts, poly.cum, s);
  return pathPointAtT(path, t);
}

type MomentThreadLayoutSample = {
  baselinePoints: Point[];
  catalogClipT: number;
};

const momentThreadLayoutCache = new Map<string, MomentThreadLayoutSample>();

function singletonMomentStationGlobalT(): number {
  return Math.min(1, MOMENT_SINGLE_RAW_T * THREAD_GLOBAL_SHORTEN);
}

function polylineAlongGlobalTSegment(
  segments: CubicSegment[],
  tStart: number,
  tEnd: number,
  samples: number,
): { pts: Point[]; cum: number[]; ts: number[] } {
  const ts: number[] = [];
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const t = tStart + u * (tEnd - tStart);
    ts.push(t);
    pts.push(pathPointAtTSegments(segments, t));
  }
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  }
  return { pts, cum, ts };
}

function pointAtArcOnPolylineExtrapolate(pts: Point[], cum: number[], s: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return pts[0]!;
  const total = cum[cum.length - 1]!;
  const last = pts[pts.length - 1]!;
  if (s >= total - 1e-9) {
    if (s <= total + 1e-9 || pts.length < 2) return last;
    const prev = pts[pts.length - 2]!;
    const chordLen = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
    const ux = (last.x - prev.x) / chordLen;
    const uy = (last.y - prev.y) / chordLen;
    const extra = s - total;
    return { x: last.x + ux * extra, y: last.y + uy * extra };
  }
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const c0 = cum[lo]!;
  const c1 = cum[hi]!;
  const p0 = pts[lo]!;
  const p1 = pts[hi]!;
  const frac = c1 - c0 < 1e-12 ? 0 : (s - c0) / (c1 - c0);
  return { x: p0.x + frac * (p1.x - p0.x), y: p0.y + frac * (p1.y - p0.y) };
}

function globalTAtArcAlongPolyline(ts: number[], cum: number[], targetDist: number): number {
  const total = cum[cum.length - 1] ?? 0;
  const s = Math.max(0, Math.min(targetDist, total));
  if (cum.length <= 1) return ts[0] ?? MOMENT_STATION_T_LO;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const c0 = cum[lo]!;
  const c1 = cum[hi]!;
  const t0 = ts[lo]!;
  const t1 = ts[hi]!;
  const frac = c1 - c0 < 1e-12 ? 0 : (s - c0) / (c1 - c0);
  return t0 + frac * (t1 - t0);
}

function computeMomentThreadLayout(path: string, count: number): MomentThreadLayoutSample {
  const segments = parseCubicPath(path);
  const tLo = MOMENT_STATION_T_LO;
  const tHi = MOMENT_STATION_T_HI;
  const tCap = 0.999999;

  if (count <= 1) {
    const clipT = singletonMomentStationGlobalT();
    return {
      baselinePoints: [pathPointAtT(path, clipT)],
      catalogClipT: clipT,
    };
  }

  if (segments.length === 0) {
    const pts: Point[] = [];
    for (let i = 0; i < count; i += 1) {
      pts.push({ x: 0, y: 0 });
    }
    return { baselinePoints: pts, catalogClipT: tHi };
  }

  const refPoly = polylineAlongGlobalTSegment(segments, tLo, tHi, 128);
  const LRef = refPoly.cum[refPoly.cum.length - 1] ?? 0;

  const samplesMain = Math.max(96, Math.min(400, 64 * Math.max(count, 2)));
  const main = polylineAlongGlobalTSegment(segments, tLo, tCap, samplesMain);
  const totalArc = main.cum[main.cum.length - 1] ?? 0;

  const gaps = count - 1;
  const baselinePoints: Point[] = [];

  if (LRef < 1e-9 || totalArc < 1e-9) {
    for (let i = 0; i < count; i += 1) {
      const u = i / gaps;
      baselinePoints.push(pathPointAtTSegments(segments, tLo + u * (tCap - tLo)));
    }
    return {
      baselinePoints,
      catalogClipT: Math.min(1, tLo + ((count - 1) / gaps) * (tCap - tLo)),
    };
  }

  const step = (MOMENT_ARC_GAP_STRETCH * LRef) / gaps;
  for (let i = 0; i < count; i += 1) {
    baselinePoints.push(pointAtArcOnPolylineExtrapolate(main.pts, main.cum, i * step));
  }

  const sLast = gaps * step;
  const sClip = Math.min(sLast, totalArc);
  const catalogClipT = globalTAtArcAlongPolyline(main.ts, main.cum, sClip);

  return { baselinePoints, catalogClipT };
}

function getMomentThreadLayout(path: string, count: number): MomentThreadLayoutSample {
  const cacheKey = `${MOMENT_ARC_LAYOUT_REVISION}:${count}:${path}`;
  const hit = momentThreadLayoutCache.get(cacheKey);
  if (hit) return hit;
  const layout = computeMomentThreadLayout(path, count);
  if (momentThreadLayoutCache.size >= MOMENT_ARC_STATION_CACHE_MAX) {
    const first = momentThreadLayoutCache.keys().next().value;
    if (first !== undefined) momentThreadLayoutCache.delete(first);
  }
  momentThreadLayoutCache.set(cacheKey, layout);
  return layout;
}

export function momentCatalogClipGlobalT(path: string, count: number): number {
  return getMomentThreadLayout(path, count).catalogClipT;
}

function momentOnForkTipChord(path: string, momentIdx: number, count: number, tEnd = 1): Point {
  const te = Math.max(0, Math.min(1, tEnd));
  const a = pathPointAtT(path, 0);
  const b = pathPointAtT(path, te);
  const edge = 0.09;
  const span = 1 - 2 * edge;
  const u = count <= 1 ? 0.5 : (momentIdx + 1) / (count + 1);
  const t = edge + u * span;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clampSavedMomentToChordSpan(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return { x: a.x, y: a.y };
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  if (t <= 0) return { x: a.x, y: a.y };
  if (t >= 1) return { x: b.x, y: b.y };
  return p;
}

function vecNorm(v: Point): Point {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

function vecSub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vecAdd(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function vecScale(v: Point, s: number): Point {
  return { x: v.x * s, y: v.y * s };
}

function vecPerpLeft(v: Point): Point {
  return { x: -v.y, y: v.x };
}

function vecDot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Open **C¹** cubic chain through knots (Catmull–Rom–style tangents), with optional tangents
 * blended toward the authored branch `catalogPath` so the spine follows limb intent.
 * Interior nearly colinear segments get a tiny lateral nudge so parallel rails don’t read as one.
 */
function threadSmoothChainAsCubicsFromKnots(
  knots: Point[],
  opts: {
    catalogPath: string;
    tipCatalogT: number;
    /** 0 = knot tangents only; 1 = full catalog tangents (magnitude preserved from knot tangents). */
    catalogTangentBlend: number;
    areaId: string;
    threadIdx: number;
    /**
     * When exactly **two** knots (fork→hub domain cluster), build one restrained connective bow
     * instead of the Catmull chain (keeps composition hub-centric; no extra routing).
     */
    connectiveBowOrigin?: Point;
  },
): string {
  const n = knots.length;
  if (n === 0) return "";
  if (n === 1) return `M${knots[0]!.x},${knots[0]!.y}`;
  if (n === 2 && opts.connectiveBowOrigin) {
    return pathFromStart(knots[0]!, [
      connectiveBowCubicPiece(knots[0]!, knots[1]!, opts.connectiveBowOrigin),
    ]);
  }
  const { catalogPath, tipCatalogT, catalogTangentBlend, areaId, threadIdx } = opts;
  const te = Math.max(1e-6, Math.min(1, tipCatalogT));
  const wCat = Math.max(0, Math.min(1, catalogTangentBlend));
  const catOk = wCat > 1e-6 && catalogPath.length > 8;

  const knotTangents: Point[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    let m: Point;
    if (i === 0) {
      m = vecSub(knots[1]!, knots[0]!);
    } else if (i === n - 1) {
      m = vecSub(knots[n - 1]!, knots[n - 2]!);
    } else {
      m = vecScale(vecSub(knots[i + 1]!, knots[i - 1]!), 0.5);
    }

    let mBlend = m;
    if (catOk) {
      const catalogTi = n === 1 ? 0 : (i / (n - 1)) * te;
      const catTan = pathTangentAtT(catalogPath, Math.min(0.999999, catalogTi));
      const catN = vecNorm(catTan);
      const mN = vecNorm(m);
      const blended = vecNorm(vecAdd(vecScale(mN, 1 - wCat), vecScale(catN, wCat)));
      const mag = Math.hypot(m.x, m.y);
      mBlend = vecScale(blended, mag);
    }
    knotTangents[i] = mBlend;
  }

  let d = `M${knots[0]!.x},${knots[0]!.y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = knots[i]!;
    const p3 = knots[i + 1]!;
    const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1;
    const maxArm = Math.min(chord * 0.48, 130);

    const capArm = (v: Point): Point => {
      const len = Math.hypot(v.x, v.y);
      if (len > maxArm && len > 1e-9) return vecScale(v, maxArm / len);
      return v;
    };

    let t0 = capArm(knotTangents[i]!);
    let t1 = capArm(knotTangents[i + 1]!);
    let c1 = vecAdd(p0, vecScale(t0, 1 / 3));
    let c2 = vecSub(p3, vecScale(t1, 1 / 3));

    if (i > 0) {
      const prev = vecSub(knots[i]!, knots[i - 1]!);
      const curr = vecSub(p3, p0);
      const lp = Math.hypot(prev.x, prev.y) || 1;
      const lc = Math.hypot(curr.x, curr.y) || 1;
      const uPrev = { x: prev.x / lp, y: prev.y / lp };
      const uCurr = { x: curr.x / lc, y: curr.y / lc };
      const align = vecDot(uPrev, uCurr);
      if (align > 0.92) {
        const seed = `${areaId}:thr${threadIdx}:seg${i}`;
        let h = 0;
        for (let k = 0; k < seed.length; k += 1) {
          h = (Math.imul(h, 31) + seed.charCodeAt(k)!) >>> 0;
        }
        const sign = (h & 1) === 0 ? 1 : -1;
        const nudge = 2.05 + (h % 9) * 0.28;
        const perp = vecPerpLeft(uCurr);
        const offset = vecScale(perp, sign * nudge);
        c1 = vecAdd(c1, offset);
        c2 = vecAdd(c2, offset);
      }
    }

    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`;
  }
  return d;
}

export function resolvedChainMomentPos(
  _areaId: string,
  _threadIdx: number,
  thread: DomainHubData,
  momentIdx: number,
  chordPath: string,
  momentPositions: Record<string, Point> | undefined,
  chordTEnd = 1,
): Point {
  const cnt = Math.max(1, thread.moments.length);
  const m = thread.moments[momentIdx];
  const saved = m ? momentPositions?.[m.id] : undefined;
  const te = Math.max(0, Math.min(1, chordTEnd));
  const chordA = pathPointAtT(chordPath, 0);
  const chordB = pathPointAtT(chordPath, te);
  if (saved) return clampSavedMomentToChordSpan(saved, chordA, chordB);
  return momentOnForkTipChord(chordPath, momentIdx, cnt, chordTEnd);
}

/**
 * Gap disc centre on the **side of the goal toward the branch** (catalog point at same `t`), not
 * the hex middle. Longitudinal threads only — domain-cluster threads use orbital placement and
 * never reach this code path (gated upstream by `!domainCluster` in `buildRenderedBranchMainPath`).
 */
function goalBranchStrokeGapCenterFruitSide(
  areaId: string,
  thread: DomainHubData,
  catalogFullPath: string,
  goalIndex: number,
  goalId: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  goalsOnThreadCount: number,
  domainClusterGatewaySpreadNormal?: Point,
): Point {
  const p = pathPointAtT(catalogFullPath, rootGoalCatalogT(goalIndex));
  const g = goalScreenPositionForLifeAreaThread(
    areaId,
    thread,
    catalogFullPath,
    goalIndex,
    goalId,
    threadIndexAlongLimb,
    branchCountOnLimb,
    goalsOnThreadCount,
    domainClusterGatewaySpreadNormal,
  );
  if (catalogFullPath.length < 8) return g;
  const dx = p.x - g.x;
  const dy = p.y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return g;
  const maxInset = Math.min(GOAL_BRANCH_STROKE_GAP_INSET_FROM_GOAL_CENTER_PX, dist * 0.52);
  const s = maxInset / dist;
  return { x: g.x + dx * s, y: g.y + dy * s };
}

function rootGoalStrokeGapCenters(
  areaId: string,
  thread: DomainHubData,
  catalogFullPath: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  domainClusterGatewaySpreadNormal?: Point,
): GoalBranchStrokeGapSpec[] {
  const n = thread.goals.length;
  return thread.goals.map((g, gi) => ({
    center: goalBranchStrokeGapCenterFruitSide(
      areaId,
      thread,
      catalogFullPath,
      gi,
      g.id,
      threadIndexAlongLimb,
      branchCountOnLimb,
      n,
      domainClusterGatewaySpreadNormal,
    ),
  }));
}

/**
 * Spline knot on the **branch rail**, nudged toward the fruit-side meet ({@link goalBranchStrokeGapCenterFruitSide})
 * so the curve approaches each goal from the side, not the hex centre.
 */
function goalThreadLinkKnot(
  areaId: string,
  thread: DomainHubData,
  catalogFullPath: string,
  goalIndex: number,
  goalId: string,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  goalsOnThreadCount: number,
  domainClusterGatewaySpreadNormal?: Point,
): Point {
  const t = rootGoalCatalogT(goalIndex);
  const p = pathPointAtT(catalogFullPath, t);
  if (catalogFullPath.length < 8) return p;
  const meet = goalBranchStrokeGapCenterFruitSide(
    areaId,
    thread,
    catalogFullPath,
    goalIndex,
    goalId,
    threadIndexAlongLimb,
    branchCountOnLimb,
    goalsOnThreadCount,
    domainClusterGatewaySpreadNormal,
  );
  const w = Math.max(0, Math.min(1, GOAL_THREAD_STROKE_KNOT_TOWARD_SCREEN_01));
  return { x: p.x + (meet.x - p.x) * w, y: p.y + (meet.y - p.y) * w };
}

/**
 * Branch thread stroke. Renders the conduit between the branch **fork** and either the longitudinal
 * tip or the **domain hub**, expressed as a smooth cubic chain through composition knots.
 *
 * **Two composition modes — hub-centric and longitudinal — share this code path:**
 *
 * - Longitudinal threads: knots are `fork → (moments) → goal-link-knots → tip`. Goals sit on the
 *   conduit via {@link rootGoalCatalogT}; gap discs sit on the goal side toward the rail via
 *   {@link goalBranchStrokeGapCenterFruitSide}. The catalog `t` carries placement semantics.
 *
 * - Domain-cluster threads ({@link shouldDomainClusterThread}): the **hub** is the semantic center.
 *   Knots collapse to `fork → hub` ({@link domainClusterHubAnchorFromCatalog}) and goals orbit the
 *   hub on a 360° ring ({@link goalScreenPositionDomainCluster}). The conduit is *connective only* —
 *   it adapts toward the hub via {@link DOMAIN_CLUSTER_STROKE_TIP_CAP} chord clipping and
 *   tangent blending in {@link threadSmoothChainAsCubicsFromKnots}, but does not carry placement
 *   authority.
 */
export function buildRenderedBranchMainPath(
  areaId: string,
  threadIdx: number,
  thread: DomainHubData,
  threadSlotPath: string,
  threadSpec: BranchForkSpec | undefined,
  layoutOv: AreaLayoutOverride | undefined,
  threadIndexAlongLimb: number,
  branchCountOnLimb: number,
  domainClusterGatewaySpreadNormal?: Point,
): { strokePath: string; catalogFullPath: string; nextGoalSlotT: number; momentChordTEnd: number } {
  const catalogFullPath =
    threadSpec != null ? branchMainPathUntilGlobalT(threadSpec, 1) : threadSlotPath;
  const domainCluster = shouldDomainClusterThread(areaId, thread);
  const nextGoalSlotCatalog = nextAutoGoalCatalogT(thread.goals);
  const nextGoalSlotT = domainCluster ? DOMAIN_CLUSTER_STROKE_TIP_CAP : nextGoalSlotCatalog;
  const strokeTipT = domainCluster
    ? DOMAIN_CLUSTER_STROKE_TIP_CAP
    : Math.min(1, Math.max(furthestRootGoalCatalogT(thread.goals), nextGoalSlotCatalog));
  const gCount = thread.goals.length;
  const useGoalLinkSpine = FLAGS.GOAL_MILESTONES && gCount > 0;
  let goalLinkKnots: Point[] = [];
  if (useGoalLinkSpine && !domainCluster) {
    goalLinkKnots = thread.goals.map((g, gi) =>
      goalThreadLinkKnot(
        areaId,
        thread,
        catalogFullPath,
        gi,
        g.id,
        threadIndexAlongLimb,
        branchCountOnLimb,
        gCount,
        domainClusterGatewaySpreadNormal,
      ),
    );
  }

  if (thread.moments.length === 0) {
    const forkPoint = pathPointAtT(catalogFullPath, 0);
    const tipClipT = domainCluster ? DOMAIN_CLUSTER_STROKE_TIP_CAP : strokeTipT;
    const hubCenter = domainCluster
      ? domainClusterHubAnchorFromCatalog(
          catalogFullPath,
          threadIndexAlongLimb,
          branchCountOnLimb,
          domainClusterGatewaySpreadNormal,
        )
      : pathPointAtT(catalogFullPath, strokeTipT);
    let hubPoint = hubCenter;
    let forkStrokeStart = forkPoint;
    if (domainCluster && catalogFullPath.length >= 8) {
      const { outward } = domainClusterBranchOutwardUnit(catalogFullPath);
      const inset = DOMAIN_CLUSTER_ICON_STROKE_INSET_PX;
      hubPoint = {
        x: hubCenter.x - outward.x * inset,
        y: hubCenter.y - outward.y * inset,
      };
      forkStrokeStart = {
        x: forkPoint.x + outward.x * (inset * 0.55),
        y: forkPoint.y + outward.y * (inset * 0.55),
      };
    }
    /** Domain cluster: conduit bends fork→hub; hub is fork-radial, not a high-`t` spline sample. */
    const tipPoint = pathPointAtT(catalogFullPath, tipClipT);

    let strokePath: string;
    if (domainCluster) {
      strokePath = threadSmoothChainAsCubicsFromKnots([forkStrokeStart, hubPoint], {
        catalogPath: catalogFullPath,
        tipCatalogT: DOMAIN_CLUSTER_STROKE_TIP_CAP,
        catalogTangentBlend: 0.63,
        areaId,
        threadIdx,
        connectiveBowOrigin: THEME_STAR_CENTER,
      });
    } else if (goalLinkKnots.length > 0) {
      strokePath = threadSmoothChainAsCubicsFromKnots([forkPoint, ...goalLinkKnots, tipPoint], {
        catalogPath: catalogFullPath,
        tipCatalogT: tipClipT,
        catalogTangentBlend: 0.63,
        areaId,
        threadIdx,
      });
    } else if (threadSpec != null) {
      strokePath = branchMainPathUntilGlobalT(threadSpec, strokeTipT);
    } else {
      strokePath = slotPathUntilGlobalT(threadSlotPath, strokeTipT);
    }

    if (FLAGS.GOAL_MILESTONES && thread.goals.length > 0 && !domainCluster) {
      strokePath = applyGoalCircleGapsToStrokePath(
        strokePath,
        rootGoalStrokeGapCenters(
          areaId,
          thread,
          catalogFullPath,
          threadIndexAlongLimb,
          branchCountOnLimb,
          domainCluster ? domainClusterGatewaySpreadNormal : undefined,
        ),
        TREE_GOAL_BRANCH_STROKE_GAP_RADIUS_PX,
      );
    }
    return { strokePath, catalogFullPath, nextGoalSlotT, momentChordTEnd: tipClipT };
  }

  const fork = pathPointAtT(catalogFullPath, 0);
  const momentFloorT = Math.min(
    1,
    momentCatalogClipGlobalT(threadSlotPath, thread.moments.length) + BRANCH_T_PAST_LAST_MOMENT,
  );
  const tipCatalogT = Math.min(1, Math.max(strokeTipT, momentFloorT), nextGoalSlotCatalog);
  const mp = layoutOv?.momentPositions;
  const momentPoints = thread.moments.map((_, mi) =>
    resolvedChainMomentPos(areaId, threadIdx, thread, mi, catalogFullPath, mp, tipCatalogT),
  );
  const tip = pathPointAtT(catalogFullPath, tipCatalogT);
  const spineKnots =
    goalLinkKnots.length > 0
      ? [fork, ...momentPoints, ...goalLinkKnots, tip]
      : [fork, ...momentPoints, tip];
  let strokePath = threadSmoothChainAsCubicsFromKnots(spineKnots, {
    catalogPath: catalogFullPath,
    tipCatalogT,
    catalogTangentBlend: goalLinkKnots.length > 0 ? 0.63 : 0.58,
    areaId,
    threadIdx,
  });
  if (FLAGS.GOAL_MILESTONES && thread.goals.length > 0) {
    strokePath = applyGoalCircleGapsToStrokePath(
      strokePath,
      rootGoalStrokeGapCenters(
        areaId,
        thread,
        catalogFullPath,
        threadIndexAlongLimb,
        branchCountOnLimb,
        domainCluster ? domainClusterGatewaySpreadNormal : undefined,
      ),
      TREE_GOAL_BRANCH_STROKE_GAP_RADIUS_PX,
    );
  }
  return { strokePath, catalogFullPath, nextGoalSlotT, momentChordTEnd: tipCatalogT };
}
