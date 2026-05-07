import type { Point } from "./tree-types";
import defaultTreeGeometryJson from "@/data/pathfinder-tree-geometry.json";
import { TREE_TRUNK_MIRROR_X } from "./tree-geometry";
import {
  translateThreadToForkPoint,
  threadKnotPolyline,
  type AreaForkSpec,
  type CubicPiece,
  type ThreadForkSpec,
} from "./tree-forks";

export type ThreadLayoutOverride = {
  forkPoint?: Point;
  /** Degrees CCW around fork after fork placement. */
  rotateDeg?: number;
  tip?: Point;
  /** CCW tilt of stroke tangent at the fork (first segment `c1` arm), degrees. */
  forkTiltDeg?: number;
  /** CCW tilt of stroke tangent at the tip (last segment `c2` arm), degrees. */
  tipTiltDeg?: number;
  /** Three interior knots between fork and tip (Hermite rebuild). Prefer this over legacy {@link bendPoint}. */
  bendPoints?: Point[];
  /** @deprecated Use {@link bendPoints} length 3 — honored only when bendPoints missing */
  bendPoint?: Point;
};

export type AreaLayoutOverride = {
  /** Rotate entire limb + all threads around trunk attach (degrees CCW). */
  limbRotateDeg?: number;
  limbTip?: Point;
  /** First limb cubic `c2` — bends the stroke near the trunk. */
  limbFirstC2?: Point;
  /** CCW tilt of stroke tangent leaving {@link AreaForkSpec.trunkAttach} (first segment `c1` arm). */
  limbForkTiltDeg?: number;
  /** CCW tilt of stroke tangent arriving at limb tip (last segment `c2` arm). */
  limbTipTiltDeg?: number;
  threads?: Record<number, ThreadLayoutOverride>;
  /** Absolute SVG positions for moments (mark ids); overrides thread-path sampling when set. */
  momentPositions?: Record<string, Point>;
};

/** Per-area layout overrides (absolute SVG coordinates / degrees). */
export type LayoutOverrides = Record<string, AreaLayoutOverride>;

export const LAYOUT_OVERRIDES_STORAGE_KEY = "pathfinder-tree-layout-overrides-v1";

/** `[leftCanonicalLimbId, rightMirroredLimbId]` paired across trunk centerline {@link TREE_TRUNK_MIRROR_X}. */
export const LEFT_RIGHT_MIRROR_PAIRS: ReadonlyArray<[string, string]> = [
  ["work", "people"],
  ["finance", "health"],
];

function mirrorPointAcrossTrunkLayout(p: Point): Point {
  return { x: 2 * TREE_TRUNK_MIRROR_X - p.x, y: p.y };
}

function mirrorThreadLayoutGeomAcrossTrunk(thread: ThreadLayoutOverride): ThreadLayoutOverride | undefined {
  const out: ThreadLayoutOverride = {};
  if (thread.forkPoint) out.forkPoint = mirrorPointAcrossTrunkLayout(thread.forkPoint);
  if (thread.tip) out.tip = mirrorPointAcrossTrunkLayout(thread.tip);
  if (thread.rotateDeg != null) out.rotateDeg = -thread.rotateDeg;
  if (thread.forkTiltDeg != null) out.forkTiltDeg = -thread.forkTiltDeg;
  if (thread.tipTiltDeg != null) out.tipTiltDeg = -thread.tipTiltDeg;
  if (thread.bendPoints?.length)
    out.bendPoints = thread.bendPoints.map((p) => mirrorPointAcrossTrunkLayout(p));
  if (thread.bendPoint) out.bendPoint = mirrorPointAcrossTrunkLayout(thread.bendPoint);
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Limb/thread geometry mirrored across the trunk vertical — excludes {@link AreaLayoutOverride.momentPositions}. */
export function mirrorAreaLayoutGeomAcrossTrunk(ov: AreaLayoutOverride): AreaLayoutOverride {
  const mirrored: AreaLayoutOverride = {};
  if (ov.limbRotateDeg != null) mirrored.limbRotateDeg = -ov.limbRotateDeg;
  if (ov.limbTip) mirrored.limbTip = mirrorPointAcrossTrunkLayout(ov.limbTip);
  if (ov.limbFirstC2) mirrored.limbFirstC2 = mirrorPointAcrossTrunkLayout(ov.limbFirstC2);
  if (ov.limbForkTiltDeg != null) mirrored.limbForkTiltDeg = -ov.limbForkTiltDeg;
  if (ov.limbTipTiltDeg != null) mirrored.limbTipTiltDeg = -ov.limbTipTiltDeg;
  if (ov.threads) {
    const threads: Record<number, ThreadLayoutOverride> = {};
    for (const [k, v] of Object.entries(ov.threads)) {
      const idx = Number(k);
      const mt = mirrorThreadLayoutGeomAcrossTrunk(v);
      if (mt && Object.keys(mt).length > 0) threads[idx] = mt;
    }
    if (Object.keys(threads).length > 0) mirrored.threads = threads;
  }
  return mirrored;
}

/**
 * Parse a **Save geometry** export (`{ layoutOverrides, ... }`) or a bare `layoutOverrides` object.
 * Returns `null` if the payload is not a non-array object map.
 */
export function parseLayoutOverridesFromJson(json: unknown): LayoutOverrides | null {
  if (json == null || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  const candidate =
    "layoutOverrides" in rec && rec.layoutOverrides != null ? rec.layoutOverrides : json;
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as LayoutOverrides;
}

/** Shipped tree layout (same file as **Save geometry** export); used when localStorage has no overrides. */
export function getDefaultLayoutOverrides(): LayoutOverrides {
  return parseLayoutOverridesFromJson(defaultTreeGeometryJson as unknown) ?? {};
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Rotate a 2D vector by `deg` counter-clockwise (degrees). */
function rotateVector2D(v: Point, deg: number): Point {
  if (Math.abs(deg) < 1e-9) return { ...v };
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Rotate tangent direction at the thread fork (incoming side of first cubic) and/or at the tip
 * (outgoing side of last cubic). Positions fork, interior knots, and tip stay fixed.
 */
export function applyThreadEndTilts(thread: ThreadForkSpec, forkTiltDeg: number, tipTiltDeg: number): ThreadForkSpec {
  if (Math.abs(forkTiltDeg) < 1e-9 && Math.abs(tipTiltDeg) < 1e-9) return thread;
  const n = thread.threadPieces.length;
  if (n === 0) return thread;
  const pieces = thread.threadPieces.map((p) => ({ ...p }));
  const fork = thread.forkPoint;
  const tip = thread.tip;
  if (Math.abs(forkTiltDeg) > 1e-9) {
    const v = sub(pieces[0].c1, fork);
    const vR = rotateVector2D(v, forkTiltDeg);
    pieces[0] = { ...pieces[0], c1: add(fork, vR) };
  }
  if (Math.abs(tipTiltDeg) > 1e-9) {
    const last = pieces[n - 1];
    const w = sub(tip, last.c2);
    const wR = rotateVector2D(w, tipTiltDeg);
    pieces[n - 1] = { ...last, c2: sub(tip, wR) };
  }
  return { ...thread, threadPieces: pieces };
}

/**
 * Rotate tangent direction where the limb leaves the trunk (first cubic `c1`) and/or where it meets the tip
 * (last cubic `c2`). Positions trunk attach, interior knots, and tip stay fixed.
 */
export function applyLimbEndTilts(spec: AreaForkSpec, forkTiltDeg: number, tipTiltDeg: number): AreaForkSpec {
  if (Math.abs(forkTiltDeg) < 1e-9 && Math.abs(tipTiltDeg) < 1e-9) return spec;
  const n = spec.limbPieces.length;
  if (n === 0) return spec;
  const limbPieces = spec.limbPieces.map((p) => ({ ...p }));
  const trunk = spec.trunkAttach;
  const tip = spec.limbTip;
  if (Math.abs(forkTiltDeg) > 1e-9) {
    const v = sub(limbPieces[0].c1, trunk);
    const vR = rotateVector2D(v, forkTiltDeg);
    limbPieces[0] = { ...limbPieces[0], c1: add(trunk, vR) };
  }
  if (Math.abs(tipTiltDeg) > 1e-9) {
    const last = limbPieces[n - 1];
    const w = sub(tip, last.c2);
    const wR = rotateVector2D(w, tipTiltDeg);
    limbPieces[n - 1] = { ...last, c2: sub(tip, wR) };
  }
  return { ...spec, limbPieces };
}

function scale(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Open Catmull–Rom tangents: knots[0]..knots[n] with n segments. */
function catmullRomTangentsOpen(knots: Point[]): Point[] {
  const n = knots.length - 1;
  const tangents: Point[] = [];
  for (let j = 0; j <= n; j++) {
    if (j === 0) tangents.push(sub(knots[1], knots[0]));
    else if (j === n) tangents.push(sub(knots[n], knots[n - 1]));
    else tangents.push(scale(sub(knots[j + 1], knots[j - 1]), 0.5));
  }
  return tangents;
}

/** C¹ cubic Bézier chain through knots (Hermite from CR tangents). */
function hermitePiecesFromOpenKnots(knots: Point[]): CubicPiece[] {
  const n = knots.length - 1;
  const T = catmullRomTangentsOpen(knots);
  const pieces: CubicPiece[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = knots[i];
    const p3 = knots[i + 1];
    const m0 = T[i];
    const m1 = T[i + 1];
    pieces.push({
      c1: add(p0, scale(m0, 1 / 3)),
      c2: sub(p3, scale(m1, 1 / 3)),
      end: p3,
    });
  }
  return pieces;
}

function rotatePoint(p: Point, pivot: Point, rad: number): Point {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

function rotateCubicPiece(piece: CubicPiece, pivot: Point, rad: number): CubicPiece {
  return {
    c1: rotatePoint(piece.c1, pivot, rad),
    c2: rotatePoint(piece.c2, pivot, rad),
    end: rotatePoint(piece.end, pivot, rad),
  };
}

/** Rotate limb geometry + every thread around trunk attach (pivot fixed). */
function rotateAreaAroundTrunk(spec: AreaForkSpec, deg: number): AreaForkSpec {
  if (Math.abs(deg) < 1e-9) return spec;
  const rad = (deg * Math.PI) / 180;
  const pivot = spec.trunkAttach;
  const limbPieces = spec.limbPieces.map((p) => rotateCubicPiece(p, pivot, rad));
  const limbTip = rotatePoint(spec.limbTip, pivot, rad);
  const threads = spec.threads.map((t) => rotateThreadSpecAboutPivot(t, pivot, rad));
  return {
    ...spec,
    limbPieces,
    limbTip,
    threads,
  };
}

function rotateThreadSpecAboutPivot(thread: ThreadForkSpec, pivot: Point, rad: number): ThreadForkSpec {
  return {
    forkPoint: rotatePoint(thread.forkPoint, pivot, rad),
    tip: rotatePoint(thread.tip, pivot, rad),
    threadPieces: thread.threadPieces.map((p) => rotateCubicPiece(p, pivot, rad)),
    strokeWidth: thread.strokeWidth,
  };
}

/** Rotate thread stroke around its fork; fork stays fixed. */
export function rotateThreadAroundFork(thread: ThreadForkSpec, deg: number): ThreadForkSpec {
  if (Math.abs(deg) < 1e-9) return thread;
  const rad = (deg * Math.PI) / 180;
  const pivot = thread.forkPoint;
  return {
    forkPoint: { ...thread.forkPoint },
    tip: rotatePoint(thread.tip, pivot, rad),
    threadPieces: thread.threadPieces.map((p) => rotateCubicPiece(p, pivot, rad)),
    strokeWidth: thread.strokeWidth,
  };
}

/**
 * Move thread tip without moving the fork.
 * Multi-segment: every interior knot shifts toward the tip delta with **smoothstep(j / n)** (0 at
 * fork → 1 at tip), then the stroke is rebuilt as one **C¹** chain — the whole thread bends and
 * moment buds (sampled at fixed path `t`) ride the new curve. Single-segment: affine control shift.
 */
export function moveThreadTipPreserveFork(thread: ThreadForkSpec, newTip: Point): ThreadForkSpec {
  const n = thread.threadPieces.length;
  if (n === 0) {
    return { ...thread, tip: newTip };
  }
  const delta = sub(newTip, thread.tip);
  if (n === 1) {
    const seg = thread.threadPieces[0];
    return {
      ...thread,
      tip: newTip,
      threadPieces: [{ c1: add(seg.c1, delta), c2: add(seg.c2, delta), end: newTip }],
    };
  }
  const knots: Point[] = [thread.forkPoint];
  for (const seg of thread.threadPieces) knots.push(seg.end);
  const newKnots = knots.map((k, j) => add(k, scale(delta, smoothstep01(j / n))));
  newKnots[newKnots.length - 1] = newTip;
  const threadPieces = hermitePiecesFromOpenKnots(newKnots);
  return {
    ...thread,
    tip: newTip,
    threadPieces,
  };
}

/**
 * Rebuild thread through fork and tip with fixed interior knots {@link bendPoints} (C¹ Hermite chain).
 */
export function applyThreadBendPoints(thread: ThreadForkSpec, bendPoints: Point[]): ThreadForkSpec {
  const knots = threadKnotPolyline(thread);
  if (knots.length < 2 || bendPoints.length === 0) return thread;
  const fork = knots[0]!;
  const tip = knots[knots.length - 1]!;
  const newKnots = [{ ...fork }, ...bendPoints.map((p) => ({ ...p })), { ...tip }];
  const threadPieces = hermitePiecesFromOpenKnots(newKnots);
  return { ...thread, threadPieces, tip };
}

function applyLimbFirstC2(spec: AreaForkSpec, c2: Point): AreaForkSpec {
  if (spec.limbPieces.length === 0) return spec;
  const limbPieces = spec.limbPieces.map((p, i) => (i === 0 ? { ...p, c2 } : p));
  return { ...spec, limbPieces };
}

function applyLimbTip(spec: AreaForkSpec, tip: Point): AreaForkSpec {
  const n = spec.limbPieces.length;
  if (n === 0) return { ...spec, limbTip: tip };
  const last = spec.limbPieces[n - 1];
  const d = sub(tip, last.end);
  const nextLast: CubicPiece = {
    c1: last.c1,
    c2: add(last.c2, { x: d.x * 0.5, y: d.y * 0.5 }),
    end: tip,
  };
  const limbPieces = spec.limbPieces.map((p, i) => (i === n - 1 ? nextLast : p));
  return { ...spec, limbTip: tip, limbPieces };
}

function areaHasOverrides(ov: AreaLayoutOverride | undefined): boolean {
  if (!ov) return false;
  if (ov.limbRotateDeg != null && Math.abs(ov.limbRotateDeg) > 1e-6) return true;
  if (ov.limbTip) return true;
  if (ov.limbFirstC2) return true;
  if (ov.limbForkTiltDeg != null && Math.abs(ov.limbForkTiltDeg) > 1e-6) return true;
  if (ov.limbTipTiltDeg != null && Math.abs(ov.limbTipTiltDeg) > 1e-6) return true;
  if (ov.threads && Object.keys(ov.threads).length > 0) return true;
  if (ov.momentPositions && Object.keys(ov.momentPositions).length > 0) return true;
  return false;
}

/**
 * Fork merge input: geometry for **people** / **health** is replaced by mirror(work) / mirror(finance)
 * across {@link TREE_TRUNK_MIRROR_X}; any stored {@link AreaLayoutOverride.momentPositions} on the right limbs stay put.
 */
export function deriveRightLimbsFromLeftMirrored(raw: LayoutOverrides): LayoutOverrides {
  const next = { ...raw };
  for (const [leftId, rightId] of LEFT_RIGHT_MIRROR_PAIRS) {
    const left = raw[leftId];
    if (!left || !areaHasOverrides(left)) continue;
    const mirroredGeom = mirrorAreaLayoutGeomAcrossTrunk(left);
    if (!areaHasOverrides(mirroredGeom)) continue;
    const mergedRight: AreaLayoutOverride = { ...mirroredGeom };
    const rp = raw[rightId]?.momentPositions;
    if (rp && Object.keys(rp).length > 0) mergedRight.momentPositions = { ...rp };
    next[rightId] = mergedRight;
  }
  return next;
}

export function loadLayoutOverrides(): LayoutOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAYOUT_OVERRIDES_STORAGE_KEY);
    if (raw == null) return getDefaultLayoutOverrides();
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as LayoutOverrides;
    }
    return getDefaultLayoutOverrides();
  } catch {
    return getDefaultLayoutOverrides();
  }
}

export function saveLayoutOverrides(overrides: LayoutOverrides): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(LAYOUT_OVERRIDES_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LAYOUT_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Merge layout overrides into catalog fork specs.
 * Order per area: limb rotate → first limb c2 → limb tip → limb fork/tip tangent tilt ° → per-thread fork → rotate → tip → bendPoints → fork/tip tilt °.
 */
export function applyLayoutOverrides(
  bases: Record<string, AreaForkSpec>,
  overrides: LayoutOverrides,
): Record<string, AreaForkSpec> {
  const out: Record<string, AreaForkSpec> = { ...bases };
  for (const [areaId, ov] of Object.entries(overrides)) {
    if (!areaHasOverrides(ov)) continue;
    const base = bases[areaId];
    if (!base) continue;
    let s = structuredClone(base) as AreaForkSpec;
    if (ov.limbRotateDeg != null) s = rotateAreaAroundTrunk(s, ov.limbRotateDeg);
    if (ov.limbFirstC2) s = applyLimbFirstC2(s, ov.limbFirstC2);
    if (ov.limbTip) s = applyLimbTip(s, ov.limbTip);
    s = applyLimbEndTilts(s, ov.limbForkTiltDeg ?? 0, ov.limbTipTiltDeg ?? 0);
    const threads = s.threads.map((t, i) => {
      const fo = ov.threads?.[i];
      if (!fo) return t;
      let th = t;
      if (fo.forkPoint) th = translateThreadToForkPoint(th, fo.forkPoint);
      if (fo.rotateDeg != null) th = rotateThreadAroundFork(th, fo.rotateDeg);
      if (fo.tip) th = moveThreadTipPreserveFork(th, fo.tip);
      const bends =
        fo.bendPoints && fo.bendPoints.length > 0 ? fo.bendPoints : fo.bendPoint ? [fo.bendPoint] : undefined;
      if (bends) th = applyThreadBendPoints(th, bends);
      th = applyThreadEndTilts(th, fo.forkTiltDeg ?? 0, fo.tipTiltDeg ?? 0);
      return th;
    });
    out[areaId] = { ...s, threads };
  }
  return out;
}
