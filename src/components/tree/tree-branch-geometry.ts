import type { BranchForkSpec, CubicPiece } from "./tree-forks";
import { branchMainPathUntilGlobalT, pathFromStart } from "./tree-forks";
import type { AreaLayoutOverride } from "./tree-layout-edit";
import type { AreaBranchData, Point, TreeGoalNode } from "./tree-types";
import {
  BRANCH_T_PAST_LAST_MOMENT,
  GOAL_BRANCH_SPACING_REF_GOALS,
  GOAL_T_FORK_PAD,
  GOAL_T_MARGIN,
  GOAL_T_SPAN,
  MOMENT_ARC_GAP_STRETCH,
  MOMENT_ARC_LAYOUT_REVISION,
  MOMENT_ARC_STATION_CACHE_MAX,
  MOMENT_SINGLE_RAW_T,
  MOMENT_STATION_T_HI,
  MOMENT_STATION_T_LO,
  THREAD_GLOBAL_SHORTEN,
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

function goalTSpacingDenomForCount(goalCount: number): number {
  return Math.max(GOAL_BRANCH_SPACING_REF_GOALS, Math.max(0, goalCount)) + 1 + GOAL_T_FORK_PAD;
}

export function goalTAlongThread(_goal: TreeGoalNode, index: number, totalGoalCount: number): number {
  const denom = goalTSpacingDenomForCount(totalGoalCount);
  return GOAL_T_MARGIN + ((index + 1 + GOAL_T_FORK_PAD) / denom) * GOAL_T_SPAN;
}

export function nextAutoGoalCatalogT(existingGoals: TreeGoalNode[]): number {
  const n = existingGoals.length;
  const totalAfter = n + 1;
  const denom = goalTSpacingDenomForCount(totalAfter);
  const t = GOAL_T_MARGIN + ((n + 1 + GOAL_T_FORK_PAD) / denom) * GOAL_T_SPAN;
  return Math.max(0, Math.min(1, t));
}

export function furthestRootGoalCatalogT(goals: TreeGoalNode[]): number {
  if (goals.length === 0) return 0;
  let maxT = 0;
  goals.forEach((g, gi) => {
    maxT = Math.max(maxT, goalTAlongThread(g, gi, goals.length));
  });
  return Math.min(1, maxT);
}

export function branchGuideStationTs(thread: AreaBranchData, nextGoalSlotT: number): number[] {
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

function threadStraightChainAsCubicsFromKnots(knots: Point[]): string {
  if (knots.length === 0) return "";
  if (knots.length === 1) return `M${knots[0].x},${knots[0].y}`;
  let d = `M${knots[0].x},${knots[0].y}`;
  for (let i = 0; i < knots.length - 1; i += 1) {
    const a = knots[i]!;
    const b = knots[i + 1]!;
    const c1 = { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
    const c2 = { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  }
  return d;
}

export function resolvedChainMomentPos(
  _areaId: string,
  _threadIdx: number,
  thread: AreaBranchData,
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

export function buildRenderedBranchMainPath(
  areaId: string,
  threadIdx: number,
  thread: AreaBranchData,
  threadSlotPath: string,
  threadSpec: BranchForkSpec | undefined,
  layoutOv: AreaLayoutOverride | undefined,
): { strokePath: string; catalogFullPath: string; nextGoalSlotT: number; momentChordTEnd: number } {
  const catalogFullPath =
    threadSpec != null ? branchMainPathUntilGlobalT(threadSpec, 1) : threadSlotPath;
  const nextGoalSlotT = nextAutoGoalCatalogT(thread.goals);
  const strokeTipT = Math.min(1, Math.max(furthestRootGoalCatalogT(thread.goals), nextGoalSlotT));

  if (thread.moments.length === 0) {
    const tipClipT = strokeTipT;
    const strokePath =
      threadSpec != null
        ? branchMainPathUntilGlobalT(threadSpec, tipClipT)
        : slotPathUntilGlobalT(threadSlotPath, tipClipT);
    return { strokePath, catalogFullPath, nextGoalSlotT, momentChordTEnd: tipClipT };
  }

  const fork = pathPointAtT(catalogFullPath, 0);
  const momentFloorT = Math.min(
    1,
    momentCatalogClipGlobalT(threadSlotPath, thread.moments.length) + BRANCH_T_PAST_LAST_MOMENT,
  );
  const tipCatalogT = Math.min(1, Math.max(strokeTipT, momentFloorT), nextGoalSlotT);
  const mp = layoutOv?.momentPositions;
  const momentPoints = thread.moments.map((_, mi) =>
    resolvedChainMomentPos(areaId, threadIdx, thread, mi, catalogFullPath, mp, tipCatalogT),
  );
  const tip = pathPointAtT(catalogFullPath, tipCatalogT);
  const strokePath = threadStraightChainAsCubicsFromKnots([fork, ...momentPoints, tip]);
  return { strokePath, catalogFullPath, nextGoalSlotT, momentChordTEnd: tipCatalogT };
}
