import type { AreaData, Point } from "./tree-types";
import { TREE_FORK_LOWER, TREE_FORK_MIDDLE, TREE_FORK_TOP } from "./tree-geometry";

/** One SVG cubic Bézier segment: C c1 c2 end (start is implicit from previous point). */
export type CubicPiece = {
  c1: Point;
  c2: Point;
  end: Point;
};

export type ThreadForkSpec = {
  /** Where the thread buds from the limb (first M of thread path). */
  forkPoint: Point;
  /** End of main thread stroke (last point of thread path). */
  tip: Point;
  /** Cubic segments after forkPoint along the thread. */
  threadPieces: CubicPiece[];
  strokeWidth: number;
};

/**
 * Explicit fork geometry for an area limb + threads.
 * Values are extracted from the previous AREA_SLOTS path strings — paths are rebuilt at render time.
 */
export type AreaForkSpec = {
  trunkAttach: Point;
  limbTip: Point;
  limbPieces: CubicPiece[];
  threads: ThreadForkSpec[];
  limbStrokeWidth: number;
};

export function pathFromStart(start: Point, pieces: CubicPiece[]): string {
  let d = `M${start.x},${start.y}`;
  for (const p of pieces) {
    d += ` C${p.c1.x},${p.c1.y} ${p.c2.x},${p.c2.y} ${p.end.x},${p.end.y}`;
  }
  return d;
}

export function limbPath(spec: AreaForkSpec): string {
  return pathFromStart(spec.trunkAttach, spec.limbPieces);
}

function cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

/** Point along limb stroke at uniform multi-segment fraction `globalT` within [0,1], matching spine slot semantics. */
export function limbPointAtUniformFraction(spec: AreaForkSpec, globalT: number): Point {
  const segs = spec.limbPieces;
  if (segs.length === 0) return spec.trunkAttach;
  const clamped = Math.max(0, Math.min(0.999999, globalT));
  const segIndex = Math.min(segs.length - 1, Math.floor(clamped * segs.length));
  const localT = clamped * segs.length - segIndex;
  const p0 = segIndex === 0 ? spec.trunkAttach : segs[segIndex - 1].end;
  const seg = segs[segIndex];
  return cubicBezierPoint(localT, p0, seg.c1, seg.c2, seg.end);
}

/** Knot polyline along thread: fork, then each segment end (= tip last). */
export function threadKnotPolyline(thread: ThreadForkSpec): Point[] {
  const k: Point[] = [thread.forkPoint];
  for (const seg of thread.threadPieces) k.push(seg.end);
  return k;
}

/** Point along thread stroke at uniform multi-segment fraction `globalT` ∈ [0,1]. */
export function threadPointAtUniformFraction(thread: ThreadForkSpec, globalT: number): Point {
  const segs = thread.threadPieces;
  if (segs.length === 0) return thread.forkPoint;
  const clamped = Math.max(0, Math.min(0.999999, globalT));
  const segIndex = Math.min(segs.length - 1, Math.floor(clamped * segs.length));
  const localT = clamped * segs.length - segIndex;
  const p0 = segIndex === 0 ? thread.forkPoint : segs[segIndex - 1]!.end;
  const seg = segs[segIndex]!;
  return cubicBezierPoint(localT, p0, seg.c1, seg.c2, seg.end);
}

/** Uniform-global `t` samples for layout-edit bend handles (fork→tip). */
export const THREAD_LAYOUT_BEND_SAMPLE_TS = [0.25, 0.5, 0.75] as const;

/** Default bend-handle positions along the resolved thread stroke (three interior influencers). */
export function threadDefaultBendHandlePoints(thread: ThreadForkSpec): Point[] {
  return THREAD_LAYOUT_BEND_SAMPLE_TS.map((t) => threadPointAtUniformFraction(thread, t));
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Left portion of cubic from {@link p0} through {@link seg}, parameter `t` ∈ (0,1] on this segment (De Casteljau). */
function splitCubicLeftHalf(p0: Point, seg: CubicPiece, t: number): CubicPiece {
  const { c1: p1, c2: p2, end: p3 } = seg;
  const q01 = lerpPoint(p0, p1, t);
  const q11 = lerpPoint(p1, p2, t);
  const q21 = lerpPoint(p2, p3, t);
  const q02 = lerpPoint(q01, q11, t);
  const q12 = lerpPoint(q11, q21, t);
  const q03 = lerpPoint(q02, q12, t);
  return { c1: q01, c2: q02, end: q03 };
}

/** Closest uniform-global `t` on limb to {@link p} (piecewise cubic, sampled per segment). */
export function closestGlobalTOnLimb(spec: AreaForkSpec, p: Point): number {
  const segs = spec.limbPieces;
  const n = segs.length;
  if (n === 0) return 0;
  let bestDist = Infinity;
  let bestGlobalT = 0;
  const samples = 56;
  for (let i = 0; i < n; i++) {
    const p0 = i === 0 ? spec.trunkAttach : segs[i - 1].end;
    const seg = segs[i];
    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      const pt = cubicBezierPoint(u, p0, seg.c1, seg.c2, seg.end);
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      const globalT = (i + u) / n;
      if (d < bestDist) {
        bestDist = d;
        bestGlobalT = globalT;
      }
    }
  }
  return Math.min(1, Math.max(0, bestGlobalT));
}

/** Largest uniform-global `t` among thread fork projections onto the limb — limb stroke ends here so it doesn’t pass beyond threads. */
export function maxForkGlobalT(spec: AreaForkSpec): number {
  if (spec.threads.length === 0) return 1;
  let m = 0;
  for (const th of spec.threads) {
    const t = closestGlobalTOnLimb(spec, th.forkPoint);
    if (t > m) m = t;
  }
  return Math.min(0.999999, m);
}

/** Limb {@link pathFromStart} clipped so stroke stops at furthest thread fork (matches rendered limb end). */
export function limbPathUntilGlobalT(spec: AreaForkSpec, globalTEnd: number): string {
  const segs = spec.limbPieces;
  const n = segs.length;
  if (n === 0) return "";
  const clamped = Math.max(0, Math.min(1, globalTEnd));
  const tn = clamped * n;
  if (tn >= n - 1e-9) {
    return limbPath(spec);
  }
  const segIndex = Math.min(n - 1, Math.floor(tn));
  const localT = tn - segIndex;
  const piecesOut: CubicPiece[] = [];
  for (let i = 0; i < segIndex; i++) {
    piecesOut.push(segs[i]);
  }
  const p0 = segIndex === 0 ? spec.trunkAttach : segs[segIndex - 1].end;
  const seg = segs[segIndex];
  const lt = Math.max(1e-9, Math.min(1, localT));
  piecesOut.push(splitCubicLeftHalf(p0, seg, lt));
  return pathFromStart(spec.trunkAttach, piecesOut);
}

/** Where the truncated limb stroke ends — use for labels instead of catalog {@link AreaForkSpec.limbTip}. */
export function limbStrokeEndPoint(spec: AreaForkSpec): Point {
  return limbPointAtUniformFraction(spec, maxForkGlobalT(spec));
}

/** Rigidly move a thread so its limb fork sits at {@link forkPoint} (fork + stroke + tip). */
export function translateThreadToForkPoint(thread: ThreadForkSpec, forkPoint: Point): ThreadForkSpec {
  const delta = { x: forkPoint.x - thread.forkPoint.x, y: forkPoint.y - thread.forkPoint.y };
  return translateThreadSpec(thread, delta);
}

function translateThreadSpec(thread: ThreadForkSpec, d: Point): ThreadForkSpec {
  const tr = (p: Point) => ({ x: p.x + d.x, y: p.y + d.y });
  return {
    forkPoint: tr(thread.forkPoint),
    tip: tr(thread.tip),
    threadPieces: thread.threadPieces.map((piece) => ({
      c1: tr(piece.c1),
      c2: tr(piece.c2),
      end: tr(piece.end),
    })),
    strokeWidth: thread.strokeWidth,
  };
}

export function threadMainPath(t: ThreadForkSpec): string {
  return pathFromStart(t.forkPoint, t.threadPieces);
}

/**
 * Main thread stroke clipped so the tip sits near uniform-global `globalTEnd` (same segment
 * normalization as limb / tree-view {@code pathPointAtT}).
 */
export function threadMainPathUntilGlobalT(t: ThreadForkSpec, globalTEnd: number): string {
  const segs = t.threadPieces;
  const n = segs.length;
  if (n === 0) return `M${t.forkPoint.x},${t.forkPoint.y}`;
  const clamped = Math.max(0, Math.min(1, globalTEnd));
  const tn = clamped * n;
  if (tn >= n - 1e-9) {
    return pathFromStart(t.forkPoint, segs);
  }
  const segIndex = Math.min(n - 1, Math.floor(tn));
  const localT = tn - segIndex;
  const piecesOut: CubicPiece[] = [];
  for (let i = 0; i < segIndex; i++) {
    piecesOut.push(segs[i]);
  }
  const p0 = segIndex === 0 ? t.forkPoint : segs[segIndex - 1].end;
  const seg = segs[segIndex];
  const lt = Math.max(1e-9, Math.min(1, localT));
  piecesOut.push(splitCubicLeftHalf(p0, seg, lt));
  return pathFromStart(t.forkPoint, piecesOut);
}

export function getAreaSlotRender(
  id: string,
  forks: Record<string, AreaForkSpec>,
): {
  limb: string;
  limbStrokeWidth: number;
  threads: Array<{ path: string; strokeWidth: number }>;
} | null {
  const spec = forks[id];
  if (!spec) return null;
  const tEnd = maxForkGlobalT(spec);
  return {
    limb: limbPathUntilGlobalT(spec, tEnd),
    limbStrokeWidth: spec.limbStrokeWidth,
    threads: spec.threads.map((t) => ({
      path: threadMainPath(t),
      strokeWidth: t.strokeWidth,
    })),
  };
}

/** Cubic Bézier control points on the chord p0→p3 so the stroke is a straight line (compatible with cubic evaluators). */
export function colinearCubicPiece(p0: Point, p3: Point): CubicPiece {
  return { c1: lerpPoint(p0, p3, 1 / 3), c2: lerpPoint(p0, p3, 2 / 3), end: p3 };
}

type StraightLimbTemplate = {
  /** Junction where this limb leaves the trunk (lower / middle / top fork). */
  trunkAttach: Point;
  /** Direction from `trunkAttach` toward this limb's hub (radians, +y = down). */
  limbStemDirRad: number;
  /** Distance fork → hub along `limbStemDirRad`. */
  limbStemLen: number;
  /** Thread fan bisector at the hub (radians); usually matches `limbStemDirRad`. */
  bisectorRad: number;
  baseTipLen: number;
  /** Extra length per thread index to reduce tip overlap. */
  tipLenPerIndex: number;
  limbStrokeWidth: number;
};

/** Lower pair: outward with net upward (negative sin θ). Middle: up-left / up-right. Top: straight up. */
const STRAIGHT_LIMB_BY_ID: Record<string, StraightLimbTemplate> = {
  finance: {
    trunkAttach: TREE_FORK_LOWER,
    limbStemDirRad: (-179 * Math.PI) / 180,
    limbStemLen: 192,
    bisectorRad: (-179 * Math.PI) / 180,
    baseTipLen: 430,
    tipLenPerIndex: 46,
    limbStrokeWidth: 7.5,
  },
  health: {
    trunkAttach: TREE_FORK_LOWER,
    limbStemDirRad: (-1 * Math.PI) / 180,
    limbStemLen: 192,
    bisectorRad: (-1 * Math.PI) / 180,
    baseTipLen: 444,
    tipLenPerIndex: 48,
    limbStrokeWidth: 7.5,
  },
  work: {
    trunkAttach: TREE_FORK_MIDDLE,
    limbStemDirRad: (-159 * Math.PI) / 180,
    limbStemLen: 198,
    bisectorRad: (-159 * Math.PI) / 180,
    baseTipLen: 436,
    tipLenPerIndex: 46,
    limbStrokeWidth: 7.5,
  },
  people: {
    trunkAttach: TREE_FORK_MIDDLE,
    limbStemDirRad: (-20 * Math.PI) / 180,
    limbStemLen: 198,
    bisectorRad: (-20 * Math.PI) / 180,
    baseTipLen: 454,
    tipLenPerIndex: 46,
    limbStrokeWidth: 7.5,
  },
  becoming: {
    trunkAttach: TREE_FORK_TOP,
    limbStemDirRad: -Math.PI / 2,
    limbStemLen: 182,
    bisectorRad: -Math.PI / 2,
    baseTipLen: 420,
    tipLenPerIndex: 44,
    limbStrokeWidth: 7,
  },
};

/**
 * Degrees from limb `bisectorRad` per thread index (narrow fan, max ±30° from base).
 * n=3: third thread (index 2) is 0° so it continues parallel to the limb stem; earlier indices fan the other way.
 * n≥6: linear from −30° to +30° inclusive (evenly spaced along the 60° window).
 */
function threadFanOffsetsDeg(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [-15, 15];
  if (n === 3) return [-24, -12, 0];
  if (n === 4) return [-30, -15, 0, 15];
  if (n === 5) return [-30, -15, 0, 15, 30];
  return Array.from({ length: n }, (_, i) => -30 + (60 * i) / (n - 1));
}

function buildStraightAreaForkFromTemplate(tpl: StraightLimbTemplate, area: AreaData | undefined): AreaForkSpec {
  const n = area?.threads.length ?? 0;
  const trunkAttach = tpl.trunkAttach;
  const hub = {
    x: trunkAttach.x + Math.cos(tpl.limbStemDirRad) * tpl.limbStemLen,
    y: trunkAttach.y + Math.sin(tpl.limbStemDirRad) * tpl.limbStemLen,
  };
  const limbPiece = colinearCubicPiece(trunkAttach, hub);
  const offsetsDeg = threadFanOffsetsDeg(n);
  const threads: ThreadForkSpec[] = [];
  /** 1-based threads 3 & 4 → swap their stem attachment along the limb (0-based indices 2 and 3). */
  const stemTForThreadIndex = (i: number) => {
    const t = (i + 1) / (n + 1);
    if (n >= 4 && i === 2) return (3 + 1) / (n + 1);
    if (n >= 4 && i === 3) return (2 + 1) / (n + 1);
    return t;
  };
  for (let i = 0; i < n; i += 1) {
    const stemT = stemTForThreadIndex(i);
    const forkPoint = lerpPoint(trunkAttach, hub, stemT);
    const ang = tpl.bisectorRad + (offsetsDeg[i]! * Math.PI) / 180;
    const L = tpl.baseTipLen + i * tpl.tipLenPerIndex;
    const tip = {
      x: forkPoint.x + Math.cos(ang) * L,
      y: forkPoint.y + Math.sin(ang) * L,
    };
    const strokeWidth = area?.threads[i]?.strokeWidth ?? 2.5;
    threads.push({
      forkPoint,
      tip,
      threadPieces: [colinearCubicPiece(forkPoint, tip)],
      strokeWidth,
    });
  }
  return {
    trunkAttach,
    limbTip: hub,
    limbPieces: [limbPiece],
    limbStrokeWidth: tpl.limbStrokeWidth,
    threads,
  };
}

const STRAIGHT_LIMB_IDS = ["finance", "work", "becoming", "people", "health"] as const;

/**
 * Straight-line fork geometry: three trunk fork heights (lower / middle / top); one limb stem fork→hub;
 * each thread forks along that stem at an even fraction, then fans within ±30° of `bisectorRad` (60° max total).
 */
export function buildStraightForksRecord(areas: AreaData[]): Record<string, AreaForkSpec> {
  const byId = Object.fromEntries(areas.map((a) => [a.id, a] as const));
  return Object.fromEntries(
    STRAIGHT_LIMB_IDS.map((id) => {
      const tpl = STRAIGHT_LIMB_BY_ID[id];
      return [id, buildStraightAreaForkFromTemplate(tpl, byId[id])] as const;
    }),
  ) as Record<string, AreaForkSpec>;
}
