import type { Point } from "./tree-types";
import { mirrorPointAcrossTrunkX, THREAD_SLOTS, TREE_TRUNK_MIRROR_X } from "./tree-geometry";

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

/** Uniform-global `t` on limb stroke where sample x ≈ `targetX` (bisection; limb x on people rises trunk→tip ~606→854). */
function limbGlobalTWhereX(spec: AreaForkSpec, targetX: number): number | null {
  const xAt = (gt: number) => limbPointAtUniformFraction(spec, gt).x;
  let low = 0;
  let high = 1;
  const xLow = xAt(low);
  const xHigh = xAt(high);
  const minx = Math.min(xLow, xHigh);
  const maxx = Math.max(xLow, xHigh);
  if (targetX < minx - 1 || targetX > maxx + 1) return null;
  const ascending = xHigh >= xLow;
  for (let i = 0; i < 34; i++) {
    const mid = (low + high) / 2;
    const xm = xAt(mid);
    if (ascending) {
      if (xm < targetX) low = mid;
      else high = mid;
    } else if (xm > targetX) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
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

/** Right-limb pin x on thread 0; work uses the mirror x across {@link TREE_TRUNK_MIRROR_X}. */
const PEOPLE_THREAD0_LIMB_SNAP_X = 700;

/** Limb x used to pin thread 0 fork. People / work stay symmetric about the trunk centerline. */
function limbSnapTargetXForArea(areaId: string): number | null {
  if (areaId === "people") return PEOPLE_THREAD0_LIMB_SNAP_X;
  if (areaId === "work") return 2 * TREE_TRUNK_MIRROR_X - PEOPLE_THREAD0_LIMB_SNAP_X;
  return null;
}

/** Snap first-thread fork onto limb at THREAD_SLOTS[][0].defaultFromT, or pinned x for people/work; translate bundled forks together. */
function snapThread0ForkToLimb(spec: AreaForkSpec, areaId: string): AreaForkSpec {
  const slots = THREAD_SLOTS[areaId];
  if (!slots?.length || !spec.threads.length) return spec;
  const attachT = slots[0].defaultFromT;
  const snapX = limbSnapTargetXForArea(areaId);
  const tPinned = snapX != null ? limbGlobalTWhereX(spec, snapX) : null;
  const limbPt =
    tPinned !== null
      ? limbPointAtUniformFraction(spec, tPinned)
      : limbPointAtUniformFraction(spec, attachT);
  const baseFork = spec.threads[0].forkPoint;
  const delta = { x: limbPt.x - baseFork.x, y: limbPt.y - baseFork.y };
  if (delta.x === 0 && delta.y === 0) return spec;

  const threads = spec.threads.map((th) =>
    samePoint(th.forkPoint, baseFork) ? translateThreadSpec(th, delta) : th,
  );
  return { ...spec, threads };
}

/** Dilates each thread cubic away from {@link ThreadForkSpec.forkPoint}; fork unchanged; tip synced to stretched terminal end. */
export const THREAD_LENGTH_FACTOR = 2;

/** Becoming upper pair (Mindset / Habits): near-straight arms were ~2× stretch → huge arc gaps between moments. */
const BECOMING_UPPER_THREAD_STRETCH = 0.85;

/** Becoming lower pair (Identity / Creativity): swooping arcs — modest reduction vs global 2×. */
const BECOMING_LOWER_THREAD_STRETCH = 1.5;

/** Per-thread override after limb snap — lower factor = shorter stroke / tighter spacing between moments on that thread. */
function resolvedThreadStretchFactor(areaId: string, threadIndex: number): number {
  if (areaId !== "becoming") return THREAD_LENGTH_FACTOR;
  if (threadIndex === 0 || threadIndex === 1) return BECOMING_UPPER_THREAD_STRETCH;
  if (threadIndex === 2 || threadIndex === 3) return BECOMING_LOWER_THREAD_STRETCH;
  return THREAD_LENGTH_FACTOR;
}

function stretchThreadForkSpecFromFork(thread: ThreadForkSpec, k: number = THREAD_LENGTH_FACTOR): ThreadForkSpec {
  const F = thread.forkPoint;
  const dilate = (p: Point) => ({ x: F.x + k * (p.x - F.x), y: F.y + k * (p.y - F.y) });
  const pieces = thread.threadPieces.map((piece) => ({
    c1: dilate(piece.c1),
    c2: dilate(piece.c2),
    end: dilate(piece.end),
  }));
  const tip = pieces.length > 0 ? pieces[pieces.length - 1]!.end : thread.tip;
  return { ...thread, threadPieces: pieces, tip };
}

/**
 * At each internal junction between cubic segments, set the outgoing `c1` so the first derivative
 * matches the incoming side (C¹). Keeps all segment ends and the fork; only adjusts `c1` on
 * segments 1..n−1 — removes corner kinks such as between buds that sit on either side of a join.
 */
function smoothThreadC1AtInternalJoints(thread: ThreadForkSpec): ThreadForkSpec {
  const n = thread.threadPieces.length;
  if (n <= 1) return thread;
  const pieces = thread.threadPieces.map((p) => ({ ...p }));
  for (let i = 1; i < n; i++) {
    const K = pieces[i - 1].end;
    const c2prev = pieces[i - 1].c2;
    pieces[i] = {
      ...pieces[i],
      c1: { x: 2 * K.x - c2prev.x, y: 2 * K.y - c2prev.y },
    };
  }
  const tipEnd = pieces[n - 1].end;
  return { ...thread, threadPieces: pieces, tip: tipEnd };
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

/** Mirror entire fork spec across {@link TREE_TRUNK_MIRROR_X} (left/right limb pairing). */
function mirrorAreaForkSpecAcrossTrunk(spec: AreaForkSpec): AreaForkSpec {
  const mx = mirrorPointAcrossTrunkX;
  return {
    trunkAttach: mx(spec.trunkAttach),
    limbTip: mx(spec.limbTip),
    limbPieces: spec.limbPieces.map((b) => ({ c1: mx(b.c1), c2: mx(b.c2), end: mx(b.end) })),
    limbStrokeWidth: spec.limbStrokeWidth,
    threads: spec.threads.map((t) => ({
      forkPoint: mx(t.forkPoint),
      tip: mx(t.tip),
      threadPieces: t.threadPieces.map((b) => ({ c1: mx(b.c1), c2: mx(b.c2), end: mx(b.end) })),
      strokeWidth: t.strokeWidth,
    })),
  };
}

export function getAreaSlotRender(
  id: string,
  forks: Record<string, AreaForkSpec> = AREA_FORKS,
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

/**
 * People & Relationships — canonical right-side limb in SVG space.
 * {@link AREA_FORKS_BASE} `work` is this spec mirrored across {@link TREE_TRUNK_MIRROR_X}.
 */
const PEOPLE_FORK_BASE: AreaForkSpec = {
  trunkAttach: { x: 606, y: 715 },
  limbTip: { x: 854, y: 498 },
  limbPieces: [
    { c1: { x: 646, y: 682 }, c2: { x: 696, y: 642 }, end: { x: 750, y: 596 } },
    { c1: { x: 786, y: 566 }, c2: { x: 822, y: 534 }, end: { x: 854, y: 498 } },
  ],
  limbStrokeWidth: 7.5,
  threads: [
    {
      forkPoint: { x: 700, y: 632 },
      tip: { x: 842, y: 430 },
      threadPieces: [
        { c1: { x: 726, y: 596 }, c2: { x: 758, y: 554 }, end: { x: 792, y: 510 } },
        { c1: { x: 812, y: 484 }, c2: { x: 830, y: 458 }, end: { x: 842, y: 430 } },
      ],
      strokeWidth: 3,
    },
    {
      forkPoint: { x: 744, y: 602 },
      tip: { x: 900, y: 600 },
      threadPieces: [
        { c1: { x: 784, y: 598 }, c2: { x: 820, y: 602 }, end: { x: 856, y: 603 } },
        { c1: { x: 880, y: 603 }, c2: { x: 894, y: 601 }, end: { x: 900, y: 600 } },
      ],
      strokeWidth: 2.4,
    },
    {
      forkPoint: { x: 786, y: 566 },
      tip: { x: 916, y: 366 },
      threadPieces: [
        { c1: { x: 808, y: 532 }, c2: { x: 834, y: 492 }, end: { x: 862, y: 452 } },
        { c1: { x: 882, y: 424 }, c2: { x: 902, y: 396 }, end: { x: 916, y: 366 } },
      ],
      strokeWidth: 2.2,
    },
    {
      forkPoint: { x: 814, y: 548 },
      tip: { x: 948, y: 332 },
      threadPieces: [
        { c1: { x: 834, y: 522 }, c2: { x: 856, y: 492 }, end: { x: 882, y: 458 } },
        { c1: { x: 908, y: 418 }, c2: { x: 932, y: 372 }, end: { x: 948, y: 332 } },
      ],
      strokeWidth: 2.1,
    },
  ],
};

/** Health & Body — canonical lower-right limb in SVG space. Finance mirrors this across trunk centerline. */
const HEALTH_FORK_BASE: AreaForkSpec = {
  trunkAttach: { x: 608, y: 878 },
  limbTip: { x: 928, y: 708 },
  limbPieces: [
    { c1: { x: 652, y: 858 }, c2: { x: 710, y: 830 }, end: { x: 778, y: 794 } },
    { c1: { x: 826, y: 770 }, c2: { x: 876, y: 742 }, end: { x: 928, y: 708 } },
  ],
  limbStrokeWidth: 7.5,
  threads: [
    {
      forkPoint: { x: 792, y: 800 },
      tip: { x: 960, y: 614 },
      threadPieces: [
        { c1: { x: 822, y: 770 }, c2: { x: 858, y: 734 }, end: { x: 898, y: 694 } },
        { c1: { x: 922, y: 668 }, c2: { x: 944, y: 642 }, end: { x: 960, y: 614 } },
      ],
      strokeWidth: 3,
    },
    {
      forkPoint: { x: 792, y: 800 },
      tip: { x: 1042, y: 796 },
      threadPieces: [
        { c1: { x: 834, y: 797 }, c2: { x: 885, y: 794 }, end: { x: 942, y: 790 } },
        { c1: { x: 977, y: 789 }, c2: { x: 1011, y: 789 }, end: { x: 1042, y: 796 } },
      ],
      strokeWidth: 2.4,
    },
    {
      forkPoint: { x: 818, y: 782 },
      tip: { x: 1010, y: 556 },
      threadPieces: [
        { c1: { x: 848, y: 752 }, c2: { x: 882, y: 716 }, end: { x: 920, y: 676 } },
        { c1: { x: 956, y: 634 }, c2: { x: 986, y: 594 }, end: { x: 1010, y: 556 } },
      ],
      strokeWidth: 2.3,
    },
    {
      forkPoint: { x: 836, y: 764 },
      tip: { x: 1060, y: 508 },
      threadPieces: [
        { c1: { x: 868, y: 732 }, c2: { x: 904, y: 692 }, end: { x: 944, y: 648 } },
        { c1: { x: 988, y: 596 }, c2: { x: 1026, y: 552 }, end: { x: 1060, y: 508 } },
      ],
      strokeWidth: 2.1,
    },
  ],
};

/** Named fork points + piece data (authoritative strokes before limb snap). */
const AREA_FORKS_BASE: Record<string, AreaForkSpec> = {
  finance: mirrorAreaForkSpecAcrossTrunk(HEALTH_FORK_BASE),
  work: mirrorAreaForkSpecAcrossTrunk(PEOPLE_FORK_BASE),
  becoming: {
    trunkAttach: { x: 600, y: 505 },
    limbTip: { x: 600, y: 196 },
    limbPieces: [
      { c1: { x: 600, y: 455 }, c2: { x: 600, y: 395 }, end: { x: 600, y: 335 } },
      { c1: { x: 600, y: 288 }, c2: { x: 600, y: 242 }, end: { x: 600, y: 196 } },
    ],
    limbStrokeWidth: 7,
    threads: [
      {
        forkPoint: { x: 580, y: 360 },
        tip: { x: 394, y: 154 },
        threadPieces: [
          { c1: { x: 552, y: 322 }, c2: { x: 516, y: 278 }, end: { x: 476, y: 236 } },
          { c1: { x: 450, y: 206 }, c2: { x: 422, y: 178 }, end: { x: 394, y: 154 } },
        ],
        strokeWidth: 2.8,
      },
      {
        forkPoint: { x: 620, y: 360 },
        tip: { x: 806, y: 154 },
        threadPieces: [
          { c1: { x: 648, y: 322 }, c2: { x: 684, y: 278 }, end: { x: 724, y: 236 } },
          { c1: { x: 750, y: 206 }, c2: { x: 778, y: 178 }, end: { x: 806, y: 154 } },
        ],
        strokeWidth: 2.8,
      },
      {
        forkPoint: { x: 582, y: 430 },
        tip: { x: 428, y: 578 },
        threadPieces: [
          { c1: { x: 554, y: 448 }, c2: { x: 522, y: 470 }, end: { x: 492, y: 496 } },
          { c1: { x: 464, y: 520 }, c2: { x: 440, y: 548 }, end: { x: 428, y: 578 } },
        ],
        strokeWidth: 2.4,
      },
      {
        forkPoint: { x: 618, y: 430 },
        tip: { x: 772, y: 578 },
        threadPieces: [
          { c1: { x: 646, y: 448 }, c2: { x: 678, y: 470 }, end: { x: 708, y: 496 } },
          { c1: { x: 736, y: 520 }, c2: { x: 760, y: 548 }, end: { x: 772, y: 578 } },
        ],
        strokeWidth: 2.4,
      },
    ],
  },
  people: PEOPLE_FORK_BASE,
  health: HEALTH_FORK_BASE,
};

/** Resolved forks — limb stroke ends at furthest thread fork; thread `t0` snaps to limb at slot `defaultFromT`. */
export const AREA_FORKS: Record<string, AreaForkSpec> = Object.fromEntries(
  Object.entries(AREA_FORKS_BASE).map(([id, spec]) => {
    const snapped = snapThread0ForkToLimb(spec, id);
    const stretched = {
      ...snapped,
      threads: snapped.threads.map((t, i) =>
        stretchThreadForkSpecFromFork(t, resolvedThreadStretchFactor(id, i)),
      ),
    };
    return [
      id,
      { ...stretched, threads: stretched.threads.map((t) => smoothThreadC1AtInternalJoints(t)) },
    ] as const;
  }),
) as Record<string, AreaForkSpec>;
