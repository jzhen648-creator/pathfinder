/**
 * Fork / branch geometry — **anchor-first**: gateways in {@link ./tree-area-anchors}; hub spokes use
 * restrained connective bows (see {@link connectiveBowCubicPiece}), not transport rails.
 */
import type { AreaData, Point } from "./tree-types";
import {
  resolveAreaAnchors,
  STRAIGHT_LIFE_AREA_IDS,
  THEME_STAR_CENTER,
  type StraightLifeAreaId,
} from "./tree-area-anchors";
import {
  CONDUIT_CONNECTIVE_BOW_CONTROL_BLEND,
  CONDUIT_CONNECTIVE_BOW_FRACTION_OF_CHORD,
  CONDUIT_CONNECTIVE_BOW_MAX_PX,
  CONDUIT_THREAD_STROKE_SCALE,
  THEME_GATEWAY_HUB_SPOKE_LENGTH_PX,
} from "./tree-view-constants";

/**
 * Four slots at the **corners of an axis-aligned square** around the gateway (diagonal directions,
 * not N/E/S/W cardinals — those read as a diamond). Index `i` matches
 * `NEW_PROFILE_ROOT_BRANCH_TEMPLATES` order per limb (0…3). Slot 0 aims toward top-right (−π/4),
 * then +90° per slot (top-right → bottom-right → bottom-left → top-left).
 */
function hubBranchAngleRad(slotIndex: number): number {
  return -Math.PI / 4 + slotIndex * (Math.PI / 2);
}

/** One SVG cubic Bézier segment: C c1 c2 end (start is implicit from previous point). */
export type CubicPiece = {
  c1: Point;
  c2: Point;
  end: Point;
};

export type BranchForkSpec = {
  /** Where the branch buds from the life-area stem (first M of branch path). */
  forkPoint: Point;
  /** End of main branch stroke (last point of branch path). */
  tip: Point;
  /** Cubic segments after forkPoint along the branch. */
  branchPieces: CubicPiece[];
  strokeWidth: number;
};

/**
 * Explicit fork geometry for a life area + its branch lines.
 * **Stem:** `trunkAttach` is **synthetic** (toward the trunk backdrop, not authored data); `limbTip`
 * is the gateway. `limbPieces` connect them (typically one colinear cubic).
 */
export type AreaForkSpec = {
  /** Synthetic stem root — coincident with the theme gateway when there is no trunk bridge; see `buildAreaForkFromAnchors`. */
  trunkAttach: Point;
  limbTip: Point;
  limbPieces: CubicPiece[];
  branches: BranchForkSpec[];
  limbStrokeWidth: number;
};

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function pathFromStart(start: Point, pieces: CubicPiece[]): string {
  let d = `M${start.x},${start.y}`;
  for (const p of pieces) {
    d += ` C${p.c1.x},${p.c1.y} ${p.c2.x},${p.c2.y} ${p.end.x},${p.end.y}`;
  }
  return d;
}

/** Stem cubics: trunk → gateway (`limbPieces` only). */
export function stemSegmentsForSpec(spec: AreaForkSpec): { start: Point; pieces: CubicPiece[] } {
  return { start: spec.trunkAttach, pieces: spec.limbPieces };
}

/** First stem segment `c2` (near-trunk bend handle), if any. */
export function areaForkStemFirstC2(spec: AreaForkSpec): Point | undefined {
  const { pieces } = stemSegmentsForSpec(spec);
  return pieces[0]?.c2;
}

export function limbPath(spec: AreaForkSpec): string {
  const { start, pieces } = stemSegmentsForSpec(spec);
  return pathFromStart(start, pieces);
}

function cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

/** Point along life-area stem stroke at uniform multi-segment fraction `globalT` within [0,1]. */
export function limbPointAtUniformFraction(spec: AreaForkSpec, globalT: number): Point {
  const { start, pieces: segs } = stemSegmentsForSpec(spec);
  if (segs.length === 0) return start;
  const clamped = Math.max(0, Math.min(0.999999, globalT));
  const segIndex = Math.min(segs.length - 1, Math.floor(clamped * segs.length));
  const localT = clamped * segs.length - segIndex;
  const p0 = segIndex === 0 ? start : segs[segIndex - 1].end;
  const seg = segs[segIndex];
  return cubicBezierPoint(localT, p0, seg.c1, seg.c2, seg.end);
}

/** Knot polyline along branch: fork, then each segment end (= tip last). */
export function branchKnotPolyline(branch: BranchForkSpec): Point[] {
  const k: Point[] = [branch.forkPoint];
  for (const seg of branch.branchPieces) k.push(seg.end);
  return k;
}

/** Point along branch stroke at uniform multi-segment fraction `globalT` ∈ [0,1]. */
export function branchPointAtUniformFraction(branch: BranchForkSpec, globalT: number): Point {
  const segs = branch.branchPieces;
  if (segs.length === 0) return branch.forkPoint;
  const clamped = Math.max(0, Math.min(0.999999, globalT));
  const segIndex = Math.min(segs.length - 1, Math.floor(clamped * segs.length));
  const localT = clamped * segs.length - segIndex;
  const p0 = segIndex === 0 ? branch.forkPoint : segs[segIndex - 1]!.end;
  const seg = segs[segIndex]!;
  return cubicBezierPoint(localT, p0, seg.c1, seg.c2, seg.end);
}

/** Uniform-global `t` samples for layout-edit bend handles (fork→tip). */
export const BRANCH_LAYOUT_BEND_SAMPLE_TS = [0.25, 0.5, 0.75] as const;

/** Default bend-handle positions along the resolved branch stroke (three interior influencers). */
export function branchDefaultBendHandlePoints(branch: BranchForkSpec): Point[] {
  return BRANCH_LAYOUT_BEND_SAMPLE_TS.map((t) => branchPointAtUniformFraction(branch, t));
}

/** Top two stroke widths per life area read as dominant conduits (ties favor lower index). */
export function branchConduitMajorFlags(strokeWidths: number[]): boolean[] {
  const n = strokeWidths.length;
  if (n === 0) return [];
  if (n <= 2) return Array.from({ length: n }, () => true);
  const indexed = strokeWidths.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s || a.i - b.i);
  const major = new Set(indexed.slice(0, 2).map((x) => x.i));
  return strokeWidths.map((_, i) => major.has(i));
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

/** De Casteljau split at `t`: left [0,t], right [t,1] as cubic from `p0` through `seg`. */
function splitCubicAt(
  p0: Point,
  seg: CubicPiece,
  t: number,
): { left: CubicPiece; rightStart: Point; right: CubicPiece } {
  const p1 = seg.c1;
  const p2 = seg.c2;
  const p3 = seg.end;
  const p4 = lerpPoint(p0, p1, t);
  const p5 = lerpPoint(p1, p2, t);
  const p6 = lerpPoint(p2, p3, t);
  const p7 = lerpPoint(p4, p5, t);
  const p8 = lerpPoint(p5, p6, t);
  const p9 = lerpPoint(p7, p8, t);
  return {
    left: { c1: p4, c2: p7, end: p9 },
    rightStart: p9,
    right: { c1: p8, c2: p6, end: p3 },
  };
}

/**
 * Stem subpath between uniform-global `t0` and `t1` (inclusive). Supports single `limbPieces`
 * segment; multi-segment limbs fall back to {@link limbPathUntilGlobalT}(t1).
 */
export function limbPathBetweenGlobalT(spec: AreaForkSpec, t0: number, t1: number): string {
  const { start: p0Stem, pieces: segs } = stemSegmentsForSpec(spec);
  if (segs.length === 0 || t1 <= t0 + 1e-9) return "";
  if (segs.length > 1) return limbPathUntilGlobalT(spec, t1);
  const seg = segs[0]!;
  const tA = Math.max(0, Math.min(1, t0));
  const tB = Math.max(tA, Math.min(1, t1));
  if (tA <= 1e-9) return limbPathUntilGlobalT(spec, tB);
  const first = splitCubicAt(p0Stem, seg, tA);
  if (tB >= 1 - 1e-9) return pathFromStart(first.rightStart, [first.right]);
  const u = (tB - tA) / Math.max(1e-9, 1 - tA);
  if (u >= 1 - 1e-9) return pathFromStart(first.rightStart, [first.right]);
  const uClamped = Math.min(1 - 1e-9, Math.max(1e-9, u));
  const second = splitCubicAt(first.rightStart, first.right, uClamped);
  return pathFromStart(first.rightStart, [second.left]);
}

/** Closest uniform-global `t` on life-area stem to {@link p} (piecewise cubic, sampled per segment). */
export function closestGlobalTOnLimb(spec: AreaForkSpec, p: Point): number {
  const { start: stemStart, pieces: segs } = stemSegmentsForSpec(spec);
  const n = segs.length;
  if (n === 0) return 0;
  let bestDist = Infinity;
  let bestGlobalT = 0;
  const samples = 56;
  for (let i = 0; i < n; i++) {
    const p0 = i === 0 ? stemStart : segs[i - 1].end;
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

/** True when all branches share the gateway as fork point (hub-and-spoke layout). */
export function isHubGatewayLayout(spec: AreaForkSpec): boolean {
  if (spec.branches.length === 0) return false;
  const gw = spec.limbTip;
  return spec.branches.every(
    (b) => Math.hypot(b.forkPoint.x - gw.x, b.forkPoint.y - gw.y) < 0.75,
  );
}

/**
 * Stable ordering for sibling branches along the life-area stem (hull sampling, depth hints, layout rows).
 *
 * **Hub gateway layout:** polar angle from gateway toward branch tip.
 *
 * **Otherwise:** order by projected stem `t`, then index.
 */
export function compareBranchIndicesForStemOrder(
  forkSpec: AreaForkSpec,
  idxA: number,
  idxB: number,
): number {
  const brA = forkSpec.branches[idxA];
  const brB = forkSpec.branches[idxB];
  if (!brA || !brB) return idxA - idxB;

  if (isHubGatewayLayout(forkSpec)) {
    const angA = Math.atan2(brA.tip.y - brA.forkPoint.y, brA.tip.x - brA.forkPoint.x);
    const angB = Math.atan2(brB.tip.y - brB.forkPoint.y, brB.tip.x - brB.forkPoint.x);
    const dAng = angA - angB;
    if (Math.abs(dAng) > 1e-9) return dAng;
    return idxA - idxB;
  }

  const tA = closestGlobalTOnLimb(forkSpec, brA.forkPoint);
  const tB = closestGlobalTOnLimb(forkSpec, brB.forkPoint);
  const dt = tA - tB;
  if (Math.abs(dt) > 1e-9) return dt;
  return idxA - idxB;
}

/** Largest uniform-global `t` among branch fork projections onto the stem — stem stroke ends here so it doesn't pass beyond branches. */
export function maxForkGlobalT(spec: AreaForkSpec): number {
  if (spec.branches.length === 0) return 1;
  let m = 0;
  for (const br of spec.branches) {
    const t = closestGlobalTOnLimb(spec, br.forkPoint);
    if (t > m) m = t;
  }
  return Math.min(0.999999, m);
}

/** Life-area stem {@link pathFromStart} clipped so stroke stops at uniform-global `globalTEnd`. */
export function limbPathUntilGlobalT(spec: AreaForkSpec, globalTEnd: number): string {
  const { start: stemStart, pieces: segs } = stemSegmentsForSpec(spec);
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
  const p0 = segIndex === 0 ? stemStart : segs[segIndex - 1].end;
  const seg = segs[segIndex];
  const lt = Math.max(1e-9, Math.min(1, localT));
  piecesOut.push(splitCubicLeftHalf(p0, seg, lt));
  return pathFromStart(stemStart, piecesOut);
}

/** Where the truncated life-area stem ends — use for labels instead of catalog {@link AreaForkSpec.limbTip}. */
export function limbStrokeEndPoint(spec: AreaForkSpec): Point {
  return limbPointAtUniformFraction(spec, maxForkGlobalT(spec));
}

/** Rigidly move a branch so its stem fork sits at {@link forkPoint} (fork + stroke + tip). */
export function translateBranchToForkPoint(branch: BranchForkSpec, forkPoint: Point): BranchForkSpec {
  const delta = { x: forkPoint.x - branch.forkPoint.x, y: forkPoint.y - branch.forkPoint.y };
  return translateBranchSpec(branch, delta);
}

function translateBranchSpec(branch: BranchForkSpec, d: Point): BranchForkSpec {
  const tr = (p: Point) => ({ x: p.x + d.x, y: p.y + d.y });
  return {
    ...branch,
    forkPoint: tr(branch.forkPoint),
    tip: tr(branch.tip),
    branchPieces: branch.branchPieces.map((piece) => ({
      c1: tr(piece.c1),
      c2: tr(piece.c2),
      end: tr(piece.end),
    })),
    strokeWidth: branch.strokeWidth,
  };
}

export function branchMainPath(b: BranchForkSpec): string {
  return pathFromStart(b.forkPoint, b.branchPieces);
}

export function branchMainPathUntilGlobalT(b: BranchForkSpec, globalTEnd: number): string {
  const segs = b.branchPieces;
  const n = segs.length;
  if (n === 0) return `M${b.forkPoint.x},${b.forkPoint.y}`;
  const clamped = Math.max(0, Math.min(1, globalTEnd));
  const tn = clamped * n;
  if (tn >= n - 1e-9) {
    return pathFromStart(b.forkPoint, segs);
  }
  const segIndex = Math.min(n - 1, Math.floor(tn));
  const localT = tn - segIndex;
  const piecesOut: CubicPiece[] = [];
  for (let i = 0; i < segIndex; i++) {
    piecesOut.push(segs[i]);
  }
  const p0 = segIndex === 0 ? b.forkPoint : segs[segIndex - 1].end;
  const seg = segs[segIndex];
  const lt = Math.max(1e-9, Math.min(1, localT));
  piecesOut.push(splitCubicLeftHalf(p0, seg, lt));
  return pathFromStart(b.forkPoint, piecesOut);
}

export function branchMainPathBetweenGlobalT(b: BranchForkSpec, t0: number, t1: number): string {
  const segs = b.branchPieces;
  const n = segs.length;
  if (n === 0 || t1 <= t0 + 1e-9) return "";
  const tA = Math.max(0, Math.min(1, t0));
  const tB = Math.max(tA, Math.min(1, t1));
  const tnA = tA * n;
  const tnB = tB * n;
  const idxA = Math.min(n - 1, Math.floor(tnA));
  const idxB = Math.min(n - 1, Math.floor(tnB));
  const uA = tnA - idxA;
  const uB = tnB - idxB;
  const fork = b.forkPoint;
  const p0At = (i: number) => (i === 0 ? fork : segs[i - 1]!.end);

  if (idxA === idxB) {
    const p0 = p0At(idxA);
    const seg = segs[idxA]!;
    const ua = Math.max(1e-9, Math.min(1, uA));
    const ub = Math.max(ua + 1e-9, Math.min(1 - 1e-9, uB));
    if (ub - ua < 1e-9) return "";
    const first = splitCubicAt(p0, seg, ua);
    const denom = Math.max(1e-9, 1 - ua);
    const u = (ub - ua) / denom;
    if (u >= 1 - 1e-9) return pathFromStart(first.rightStart, [first.right]);
    const uClamped = Math.min(1 - 1e-9, Math.max(1e-9, u));
    const second = splitCubicAt(first.rightStart, first.right, uClamped);
    return pathFromStart(first.rightStart, [second.left]);
  }

  const piecesOut: CubicPiece[] = [];
  {
    const p0 = p0At(idxA);
    const seg = segs[idxA]!;
    const ua = Math.max(1e-9, Math.min(1, uA));
    const first = splitCubicAt(p0, seg, ua);
    piecesOut.push(first.right);
  }
  for (let i = idxA + 1; i < idxB; i += 1) {
    piecesOut.push(segs[i]!);
  }
  {
    const p0 = p0At(idxB);
    const seg = segs[idxB]!;
    const ub = Math.max(1e-9, Math.min(1, uB));
    piecesOut.push(splitCubicLeftHalf(p0, seg, ub));
  }

  const p0Start = p0At(idxA);
  const segStart = segs[idxA]!;
  const uaStart = Math.max(1e-9, Math.min(1, uA));
  const firstStart = splitCubicAt(p0Start, segStart, uaStart);
  return pathFromStart(firstStart.rightStart, piecesOut);
}

export function getAreaSlotRender(
  id: string,
  forks: Record<string, AreaForkSpec>,
): {
  limb: string;
  limbStrokeWidth: number;
  branchStrokes: Array<{ path: string; strokeWidth: number }>;
} | null {
  const spec = forks[id];
  if (!spec) return null;
  const tEnd = maxForkGlobalT(spec);
  return {
    limb: limbPathUntilGlobalT(spec, tEnd),
    limbStrokeWidth: spec.limbStrokeWidth,
    branchStrokes: spec.branches.map((br) => ({
      path: branchMainPath(br),
      strokeWidth: br.strokeWidth,
    })),
  };
}

/** Cubic Bézier control points on the chord p0→p3 so the stroke is a straight line (compatible with cubic evaluators). */
export function colinearCubicPiece(p0: Point, p3: Point): CubicPiece {
  return { c1: lerpPoint(p0, p3, 1 / 3), c2: lerpPoint(p0, p3, 2 / 3), end: p3 };
}

/**
 * Single cubic **p0 → p3** with restrained outward bow (connective / atmospheric only — not semantic rail).
 * Bow lies on the chord side **opposite** `bowOrigin` (typically the shared theme composition centre).
 */
export function connectiveBowCubicPiece(p0: Point, p3: Point, bowOrigin: Point): CubicPiece {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return colinearCubicPiece(p0, p3);
  const amp = Math.min(
    CONDUIT_CONNECTIVE_BOW_MAX_PX,
    len * CONDUIT_CONNECTIVE_BOW_FRACTION_OF_CHORD,
  );
  const cross = dx * (bowOrigin.y - p0.y) - dy * (bowOrigin.x - p0.x);
  const nx = cross > 0 ? dy / len : -dy / len;
  const ny = cross > 0 ? -dx / len : dx / len;
  const ux = dx / len;
  const uy = dy / len;
  const b = CONDUIT_CONNECTIVE_BOW_CONTROL_BLEND * amp;
  return {
    c1: { x: p0.x + ux * (len / 3) + nx * b, y: p0.y + uy * (len / 3) + ny * b },
    c2: { x: p0.x + ux * ((2 * len) / 3) + nx * b, y: p0.y + uy * ((2 * len) / 3) + ny * b },
    end: p3,
  };
}

/** SVG `d` for one bowed connective segment (`M` + single `C`). */
export function connectiveBowPathD(p0: Point, p3: Point, bowOrigin: Point): string {
  return pathFromStart(p0, [connectiveBowCubicPiece(p0, p3, bowOrigin)]);
}

function emptyForkSpec(): AreaForkSpec {
  return {
    trunkAttach: { x: 0, y: 0 },
    limbTip: { x: 0, y: 0 },
    limbPieces: [],
    branches: [],
    limbStrokeWidth: 1,
  };
}

/**
 * Build fork geometry from authored gateways: theme node at {@link AreaAnchors.gateway}, up to four
 * hub branches at square-corner directions (90° apart on the diagonal frame; no trunk-direction stem).
 */
export function buildAreaForkFromAnchors(
  areaId: string,
  area: AreaData | undefined,
): AreaForkSpec {
  const straightId = areaId as StraightLifeAreaId;
  if (!STRAIGHT_LIFE_AREA_IDS.includes(straightId)) return emptyForkSpec();
  const anchors = resolveAreaAnchors(straightId);

  const gateway = { ...anchors.gateway };
  const trunkAttach = { ...gateway };
  /** Degenerate cubic so `pathPointAtT(slots.limb, t)` stays on the gateway when the trunk bridge is omitted. */
  const stemPiece = colinearCubicPiece(gateway, gateway);
  const limbStrokeWidth = anchors.limbStrokeWidth;
  const n = Math.min(4, area?.branches.length ?? 0);
  const strokeW = 2.5 * CONDUIT_THREAD_STROKE_SCALE;
  const branches: BranchForkSpec[] = [];
  for (let i = 0; i < n; i += 1) {
    const ang = hubBranchAngleRad(i);
    const tip = {
      x: gateway.x + Math.cos(ang) * THEME_GATEWAY_HUB_SPOKE_LENGTH_PX,
      y: gateway.y + Math.sin(ang) * THEME_GATEWAY_HUB_SPOKE_LENGTH_PX,
    };
    branches.push({
      forkPoint: { ...gateway },
      tip,
      branchPieces: [connectiveBowCubicPiece(gateway, tip, THEME_STAR_CENTER)],
      strokeWidth: strokeW,
    });
  }

  return {
    trunkAttach,
    limbTip: gateway,
    limbPieces: [stemPiece],
    limbStrokeWidth,
    branches,
  };
}

export function buildAreaForksRecord(areas: AreaData[]): Record<string, AreaForkSpec> {
  const byId = Object.fromEntries(areas.map((a) => [a.id, a] as const));
  return Object.fromEntries(
    STRAIGHT_LIFE_AREA_IDS.map((id) => [id, buildAreaForkFromAnchors(id, byId[id])] as const),
  );
}

/** @deprecated Second argument is ignored (territorial negotiation removed). */
export type BuildStraightForksOptions = {
  skipTerritorialNegotiation?: boolean;
};

/** @deprecated Use {@link buildAreaForksRecord} */
export function buildStraightForksRecord(
  areas: AreaData[],
  _options?: BuildStraightForksOptions,
): Record<string, AreaForkSpec> {
  return buildAreaForksRecord(areas);
}
