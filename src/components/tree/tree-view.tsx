"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { mapToTreeData, type RawBranch, type RawMark, type RawTreeGoalPayload } from "./tree-data";
import { TreeGoalNodeSvg } from "./tree-goal-visual";
import { AREA_LABEL_CONFIG, TREE_TRUNK_MIRROR_X, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./tree-geometry";
import type { AreaData, MomentNode, Point, ThreadData, TreeGoalNode } from "./tree-types";
import {
  AREA_FORKS,
  type AreaForkSpec,
  type ThreadForkSpec,
  closestGlobalTOnLimb,
  getAreaSlotRender,
  limbPointAtUniformFraction,
  limbStrokeEndPoint,
  THREAD_LAYOUT_BEND_SAMPLE_TS,
  threadDefaultBendHandlePoints,
  threadPointAtUniformFraction,
  threadMainPathUntilGlobalT,
} from "./tree-forks";
import {
  applyLayoutOverrides,
  deriveRightLimbsFromLeftMirrored,
  getDefaultLayoutOverrides,
  loadLayoutOverrides,
  mirrorAreaLayoutGeomAcrossTrunk,
  parseLayoutOverridesFromJson,
  saveLayoutOverrides,
  type AreaLayoutOverride,
  type ThreadLayoutOverride,
} from "./tree-layout-edit";
import { PfChromeTopbar, PfChromeViewsNav } from "@/components/shell/pf-chrome";
import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

type PanelState =
  | { type: "none" }
  | { type: "foundations" }
  | { type: "area"; area: AreaData }
  | { type: "moment"; moment: MomentNode; area: AreaData };

type MarksResponse = { marks?: unknown[] };
type BranchesResponse = unknown[] | { branches?: unknown[]; goals?: unknown[] };

type TreeSVGProps = {
  /** Rendered limbs (respects sidebar visibility toggles). */
  areas: AreaData[];
  /**
   * Full limb list for mirror math (moment positions + overrides). Defaults to the rendered `areas` prop.
   * Pass every loaded limb so paired limbs still mirror when one side is toggled off in the sidebar.
   */
  mirrorAreas?: AreaData[];
  focused: string | null;
  panel: PanelState;
  onClear: () => void;
  onAreaClick: (area: AreaData) => void;
  onThreadClick: (threadId: string) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
  onFoundationsClick: () => void;
  /** Capture target for visual PDF export (tree viewport only; excludes dev HUD). */
  exportRootRef?: React.RefObject<HTMLDivElement | null>;
};

type TreePanelProps = {
  panel: PanelState;
  areas: AreaData[];
  onClose: () => void;
  onCreateBranchFromMoment: (input: {
    limbId: string;
    parentBranchId: string;
    turningPointId: string;
    label: string;
  }) => Promise<{ ok: boolean; error?: string }>;
};

type ViewMode = "tree" | "timeline" | "thread";

/** Dev-only: drag thread fork points; set `NEXT_PUBLIC_TREE_LAYOUT_EDITOR=1` to enable in production builds. */
const TREE_LAYOUT_EDIT_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_LAYOUT_EDITOR === "1";

/** Tree SVG rolling render-rate HUD; set `NEXT_PUBLIC_TREE_RENDER_STATS=1` for production builds. */
const TREE_RENDER_STATS_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_RENDER_STATS === "1";

/** Subtle small dev labels (title slice + id slice) on the tree; opt-in for prod via `NEXT_PUBLIC_TREE_MOMENT_DEV_LABELS=1`. */
const TREE_MOMENT_DEV_LABELS_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_MOMENT_DEV_LABELS === "1";

const TREE_RENDER_STATS_WINDOW_MS = 60_000;

/**
 * Uniform scale around the trunk pivot so limbs, threads, moments, and trunk art spread together.
 * {@link clientToWorldSvg} inverts this so layout-edit coordinates stay in stored fork/slot space.
 */
const TREE_LAYOUT_WORLD_SCALE = 1.14;
const TREE_LAYOUT_SCALE_ORIGIN_Y = 680;

function panViewportToStoredTreeCoords(p: Point): Point {
  const cx = TREE_TRUNK_MIRROR_X;
  const cy = TREE_LAYOUT_SCALE_ORIGIN_Y;
  const s = TREE_LAYOUT_WORLD_SCALE;
  if (Math.abs(s - 1) < 1e-9) return p;
  return { x: cx + (p.x - cx) / s, y: cy + (p.y - cy) / s };
}

function TreeRenderStatsHud({ marksRef }: { marksRef: MutableRefObject<number[]> }) {
  const [rpm, setRpm] = useState(0);
  useEffect(() => {
    const tick = () => {
      if (typeof performance === "undefined") return;
      const nowMs = performance.now();
      marksRef.current = marksRef.current.filter((t) => nowMs - t <= TREE_RENDER_STATS_WINDOW_MS);
      setRpm(marksRef.current.length);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [marksRef]);
  if (typeof performance === "undefined") return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        top: 10,
        zIndex: 20,
        pointerEvents: "none",
        padding: "5px 9px",
        borderRadius: 8,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: "#E7E5E4",
        background: "rgba(0,0,0,0.58)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {rpm} renders / min
      <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 6 }}>(rolling 60s)</span>
    </div>
  );
}

function clientToWorldSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewWidth: number,
  viewHeight: number,
  pan: { x: number; y: number; scale: number },
): Point {
  const rect = svg.getBoundingClientRect();
  const vx = ((clientX - rect.left) / Math.max(rect.width, 1)) * viewWidth;
  const vy = ((clientY - rect.top) / Math.max(rect.height, 1)) * viewHeight;
  return panViewportToStoredTreeCoords({
    x: (vx - pan.x) / pan.scale,
    y: (vy - pan.y) / pan.scale,
  });
}

type LayoutPointerDrag =
  | {
      kind: "threadFork";
      areaId: string;
      threadIdx: number;
      pointerId: number;
      startClientX: number;
      startClientY: number;
    }
  | {
      kind: "threadRotate";
      areaId: string;
      threadIdx: number;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      pivot: Point;
      startAngle: number;
      baseRotateDeg: number;
    }
  | {
      kind: "threadBend";
      areaId: string;
      threadIdx: number;
      bendIndex: number;
      pointerId: number;
      startClientX: number;
      startClientY: number;
    }
  | { kind: "limbTip"; areaId: string; pointerId: number; startClientX: number; startClientY: number }
  | { kind: "limbC2"; areaId: string; pointerId: number; startClientX: number; startClientY: number }
  | { kind: "moment"; areaId: string; momentId: string; pointerId: number; startClientX: number; startClientY: number };

const LAYOUT_DRAG_THRESHOLD_PX = 3;

function hasCrossedLayoutDragThreshold(
  d: { startClientX: number; startClientY: number },
  clientX: number,
  clientY: number,
): boolean {
  return Math.hypot(clientX - d.startClientX, clientY - d.startClientY) >= LAYOUT_DRAG_THRESHOLD_PX;
}

const MOCK_USER_STORAGE_KEY = "pathfinder.tree.mockUserId";

type MockUserOption = {
  id: string;
  name: string;
  email: string;
};

const nodeRadius = (sig: number): number => (sig === 3 ? 5 : sig === 2 ? 4 : 3);

function mirrorPointAcrossTrunkForLayout(p: Point): Point {
  return { x: 2 * TREE_TRUNK_MIRROR_X - p.x, y: p.y };
}

function mirroredThreadOverride(
  thread: ThreadLayoutOverride | undefined,
): ThreadLayoutOverride | undefined {
  if (!thread) return undefined;
  const out: ThreadLayoutOverride = {};
  if (thread.forkPoint) out.forkPoint = mirrorPointAcrossTrunkForLayout(thread.forkPoint);
  if (thread.tip) out.tip = mirrorPointAcrossTrunkForLayout(thread.tip);
  if (thread.rotateDeg != null) out.rotateDeg = -thread.rotateDeg;
  if (thread.forkTiltDeg != null) out.forkTiltDeg = -thread.forkTiltDeg;
  if (thread.tipTiltDeg != null) out.tipTiltDeg = -thread.tipTiltDeg;
  if (thread.bendPoints?.length)
    out.bendPoints = thread.bendPoints.map((p) => mirrorPointAcrossTrunkForLayout(p));
  if (thread.bendPoint) out.bendPoint = mirrorPointAcrossTrunkForLayout(thread.bendPoint);
  return Object.keys(out).length > 0 ? out : undefined;
}

function hasAreaOverride(ov: AreaLayoutOverride): boolean {
  return (
    (ov.limbRotateDeg != null && Math.abs(ov.limbRotateDeg) > 1e-6) ||
    ov.limbTip != null ||
    ov.limbFirstC2 != null ||
    (ov.limbForkTiltDeg != null && Math.abs(ov.limbForkTiltDeg) > 1e-6) ||
    (ov.limbTipTiltDeg != null && Math.abs(ov.limbTipTiltDeg) > 1e-6) ||
    (ov.threads != null && Object.keys(ov.threads).length > 0) ||
    (ov.momentPositions != null && Object.keys(ov.momentPositions).length > 0)
  );
}

function mirrorAreaOverride(ov: AreaLayoutOverride): AreaLayoutOverride {
  return mirrorAreaLayoutGeomAcrossTrunk(ov);
}

function mirroredPartner(areaId: string): string | null {
  if (areaId === "people") return "work";
  if (areaId === "work") return "people";
  if (areaId === "health") return "finance";
  if (areaId === "finance") return "health";
  return null;
}

/**
 * Becoming layout mirrors {@link mirroredThreadOverride} between fixed indices matching {@link AREA_FORKS} slots
 * (`tree-forks.ts`: Mindset 0, Habits 1, Identity 2, Creativity 3): Mindset ↔ Creativity (0 ↔ 3), Habits ↔ Identity (1 ↔ 2).
 */
function intraAreaMirrorPartnerThreadIdx(areaId: string, threadIdx: number): number | null {
  if (areaId !== "becoming") return null;
  if (threadIdx === 0) return 3;
  if (threadIdx === 3) return 0;
  if (threadIdx === 1) return 2;
  if (threadIdx === 2) return 1;
  return null;
}

function applyIntraAreaThreadMirror(
  areaId: string,
  threads: Record<number, ThreadLayoutOverride>,
  threadIdx: number,
): Record<number, ThreadLayoutOverride> {
  const mirrorIdx = intraAreaMirrorPartnerThreadIdx(areaId, threadIdx);
  if (mirrorIdx == null) return threads;
  const mirrored = mirroredThreadOverride(threads[threadIdx]);
  if (mirrored) threads[mirrorIdx] = mirrored;
  else delete threads[mirrorIdx];
  return threads;
}

function upsertAreaAndMirror(
  prev: Record<string, AreaLayoutOverride>,
  areaId: string,
  areaOverride: AreaLayoutOverride,
): Record<string, AreaLayoutOverride> {
  const next = { ...prev };
  const pair = mirroredPartner(areaId);
  const LEFT_CANONICAL_PAIR_LIMBS = new Set(["work", "finance"]);
  const RIGHT_PAIR_LIMBS = new Set(["people", "health"]);

  if (pair && LEFT_CANONICAL_PAIR_LIMBS.has(areaId)) {
    if (hasAreaOverride(areaOverride)) next[areaId] = areaOverride;
    else delete next[areaId];
    return next;
  }

  if (pair && RIGHT_PAIR_LIMBS.has(areaId)) {
    const mirroredLeft = mirrorAreaOverride(areaOverride);
    if (hasAreaOverride(mirroredLeft)) next[pair] = mirroredLeft;
    else delete next[pair];

    const momentsOnly: AreaLayoutOverride = {};
    if (areaOverride.momentPositions && Object.keys(areaOverride.momentPositions).length > 0) {
      momentsOnly.momentPositions = areaOverride.momentPositions;
    }
    if (hasAreaOverride(momentsOnly)) next[areaId] = momentsOnly;
    else delete next[areaId];
    return next;
  }

  if (hasAreaOverride(areaOverride)) next[areaId] = areaOverride;
  else delete next[areaId];
  return next;
}
function statusFromMoment(moment: MomentNode): "bloomed" | "growing" | "ended" {
  if (moment.bloomStatus === "ENDED") return "ended";
  if (moment.bloomStatus === "GROWING" || moment.future) return "growing";
  return "bloomed";
}

function statusBadgeStyle(status: "bloomed" | "growing" | "ended"): CSSProperties {
  if (status === "growing") {
    return {
      background: "var(--color-background-success, rgba(34,197,94,0.12))",
      color: "var(--color-text-success, #16A34A)",
    };
  }
  if (status === "ended") {
    return {
      background: "var(--color-background-secondary, rgba(148,163,184,0.15))",
      color: "var(--color-text-tertiary, #64748B)",
    };
  }
  return {
    background: "var(--color-background-warning, rgba(245,158,11,0.14))",
    color: "var(--color-text-warning, #B45309)",
  };
}

function sigLabel(sig: number): string {
  if (sig >= 3) return "defining moment";
  if (sig === 2) return "meaningful chapter";
  return "part of the journey";
}

function normalizeBranches(payload: BranchesResponse): RawBranch[] {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.branches) ? payload.branches : [];
  return rows as RawBranch[];
}

function normalizeMarks(payload: MarksResponse): RawMark[] {
  const rows = Array.isArray(payload?.marks) ? payload.marks : [];
  return rows as RawMark[];
}

function normalizeGoalsFromBranches(payload: BranchesResponse): RawTreeGoalPayload[] {
  if (Array.isArray(payload)) return [];
  const rows = Array.isArray(payload.goals) ? payload.goals : [];
  return rows as RawTreeGoalPayload[];
}

function goalTAlongThread(goal: TreeGoalNode, index: number, total: number): number {
  if (goal.positionAngle != null && goal.positionAngle >= 0 && goal.positionAngle <= 1) {
    return 0.06 + goal.positionAngle * 0.88;
  }
  return 0.06 + ((index + 1) / (total + 1)) * 0.88;
}

function renderGoalsSubtree(
  goal: TreeGoalNode,
  pos: Point,
  areaColor: string,
  expandedGoalIds: Set<string>,
  showAllGoalMilestones: boolean,
  bloomPlayingIds: Set<string>,
  toggleGoalExpand: (id: string) => void,
  depth: number,
) {
  const showMs = expandedGoalIds.has(goal.id) || showAllGoalMilestones;
  const milestonesNodes = showMs
    ? goal.milestones.map((m, mi) => {
        const span = Math.max(1, goal.milestones.length);
        const ang = (mi / span) * Math.PI * 1.4 - Math.PI * 0.7;
        const mx = pos.x + Math.cos(ang) * 18;
        const my = pos.y + Math.sin(ang) * 18;
        return (
          <g key={m.id}>
            <title>{m.title}</title>
            <circle cx={mx} cy={my} r={3} fill={areaColor} opacity={0.82} pointerEvents="none" />
          </g>
        );
      })
    : null;

  const childNodes = goal.childGoals.map((c, ci) => {
    const n = goal.childGoals.length;
    const ang = (ci / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    const len = 32 + depth * 6;
    const cpos = { x: pos.x + Math.cos(ang) * len, y: pos.y + Math.sin(ang) * len };
    return (
      <g key={c.id}>
        <line
          x1={pos.x}
          y1={pos.y}
          x2={cpos.x}
          y2={cpos.y}
          stroke={areaColor}
          strokeWidth={1.6}
          opacity={0.78}
          pointerEvents="none"
        />
        {renderGoalsSubtree(
          c,
          cpos,
          areaColor,
          expandedGoalIds,
          showAllGoalMilestones,
          bloomPlayingIds,
          toggleGoalExpand,
          depth + 1,
        )}
      </g>
    );
  });

  return (
    <g>
      <TreeGoalNodeSvg
        cx={pos.x}
        cy={pos.y}
        color={areaColor}
        status={goal.bloomStatus}
        title={goal.title}
        pulseGrowing={goal.bloomStatus === "GROWING"}
        bloomPlaying={bloomPlayingIds.has(goal.id)}
        onClick={() => toggleGoalExpand(goal.id)}
      />
      {milestonesNodes}
      {childNodes}
    </g>
  );
}

function getOpacity(focused: string | null, limbId: string): number {
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

function pathPointAtT(path: string, t: number): Point {
  return pathPointAtTSegments(parseCubicPath(path), t);
}

/** Extra uniform-global length past the nominal bud station when a thread has no moments (catalog stroke only). */
const THREAD_TIP_MARGIN_PAST_LAST = 0.035;

/**
 * Upper bound on global path `t` for buds / clipped strokes — use full slot length so arc-length spacing
 * uses the entire thread curve (all limbs equally).
 */
const THREAD_GLOBAL_SHORTEN = 1;

/**
 * Raw-path endpoints [LO, HI] before multiply-by-shorten — span nearly the whole slot from fork neighborhood
 * to tip so equal arc splits maximize gap along the curve.
 */
const MOMENT_STATION_RAW_LO = 0.02;
const MOMENT_STATION_RAW_HI = 1;

const MOMENT_STATION_T_LO = MOMENT_STATION_RAW_LO * THREAD_GLOBAL_SHORTEN;
const MOMENT_STATION_T_HI = MOMENT_STATION_RAW_HI * THREAD_GLOBAL_SHORTEN;

/** Single-thread bud station (global `t` before shorten scaling). */
const MOMENT_SINGLE_RAW_T = 0.52;

/**
 * Multiplier on baseline arc spacing along [MOMENT_STATION_T_LO, MOMENT_STATION_T_HI]: {@code 2} doubles the
 * arc-length gap between consecutive buds. When that pushes past the catalog stroke end, buds extrapolate in a
 * straight line past the tip (endpoint may leave the drawn slot path).
 */
const MOMENT_ARC_GAP_STRETCH = 2;

/** Bump when station span constants change (arc-length cache keys must miss stale rows). */
const MOMENT_ARC_LAYOUT_REVISION = 10;

const MOMENT_ARC_STATION_CACHE_MAX = 96;

type MomentThreadLayoutSample = {
  baselinePoints: Point[];
  /** Global `t` for clipping the catalog stroke when not using a custom chain spline. */
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

/** Point at arc distance {@code s} from {@code pts[0]} along the polyline; past the tip, extend along the final chord. */
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

function arcLengthMomentStationSegment(path: string): number {
  const segments = parseCubicPath(path);
  if (segments.length === 0) return 0;
  const poly = polylineAlongGlobalTSegment(segments, MOMENT_STATION_T_LO, MOMENT_STATION_T_HI, 128);
  return poly.cum[poly.cum.length - 1] ?? 0;
}

/** Arc distance {@link arcOffset} from {@link MOMENT_STATION_T_LO} along [LO, HI], clamped to segment length; maps through {@link globalTAtArcAlongPolyline} → {@link pathPointAtT}. */
function momentPositionAtArcOffsetFromStationLo(path: string, arcOffset: number): Point {
  const segments = parseCubicPath(path);
  if (segments.length === 0) return pathPointAtT(path, MOMENT_STATION_T_LO);
  const poly = polylineAlongGlobalTSegment(segments, MOMENT_STATION_T_LO, MOMENT_STATION_T_HI, 256);
  const totalArc = poly.cum[poly.cum.length - 1] ?? 0;
  const s = Math.max(0, Math.min(arcOffset, totalArc));
  const t = globalTAtArcAlongPolyline(poly.ts, poly.cum, s);
  return pathPointAtT(path, t);
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

function threadMomentBaselinePoint(path: string, momentIdx: number, count: number): Point {
  const { baselinePoints } = getMomentThreadLayout(path, count);
  return baselinePoints[momentIdx] ?? baselinePoints[baselinePoints.length - 1]!;
}

function momentCatalogClipGlobalT(path: string, count: number): number {
  return getMomentThreadLayout(path, count).catalogClipT;
}

function pathEnd(path: string): Point {
  const nums = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length < 2) return { x: 0, y: 0 };
  return { x: nums[nums.length - 2], y: nums[nums.length - 1] };
}

function addPt(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subPt(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scalePt(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

/** Smooth cubic path from fork/start through each moment knot; curve ends at the last moment (no catalog tip). */
function threadPathThroughMoments(basePath: string, momentPoints: Point[]): string {
  if (momentPoints.length === 0) return basePath;
  const start = pathPointAtT(basePath, 0);
  const knots = [start, ...momentPoints];
  if (knots.length < 2) return basePath;
  let d = `M${knots[0].x},${knots[0].y}`;
  const lastIdx = knots.length - 1;
  for (let i = 0; i < lastIdx; i += 1) {
    const p0 = knots[i];
    const p3 = knots[i + 1];
    const m0 = i === 0 ? subPt(knots[1], knots[0]) : scalePt(subPt(knots[i + 1], knots[i - 1]), 0.5);
    const m1 =
      i + 1 === lastIdx
        ? subPt(knots[lastIdx], knots[lastIdx - 1])
        : scalePt(subPt(knots[i + 2], knots[i]), 0.5);
    const c1 = addPt(p0, scalePt(m0, 1 / 3));
    const c2 = subPt(p3, scalePt(m1, 1 / 3));
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`;
  }
  return d;
}

function resolvedChainMomentPos(
  _areaId: string,
  _threadIdx: number,
  thread: ThreadData,
  momentIdx: number,
  slotPath: string,
  momentPositions: Record<string, Point> | undefined,
): Point {
  const cnt = Math.max(1, thread.moments.length);
  const m = thread.moments[momentIdx];
  const saved = m ? momentPositions?.[m.id] : undefined;
  if (saved) return saved;
  return threadMomentBaselinePoint(slotPath, momentIdx, cnt);
}

function buildRenderedThreadMainPath(
  areaId: string,
  threadIdx: number,
  thread: ThreadData,
  threadSlotPath: string,
  threadSpec: ThreadForkSpec | undefined,
  layoutOv: AreaLayoutOverride | undefined,
): string {
  if (thread.moments.length === 0) {
    const tipClipT = Math.min(1, singletonMomentStationGlobalT() + THREAD_TIP_MARGIN_PAST_LAST);
    return threadSpec != null ? threadMainPathUntilGlobalT(threadSpec, tipClipT) : threadSlotPath;
  }

  const mp = layoutOv?.momentPositions;
  const momentPoints = thread.moments.map((_, mi) =>
    resolvedChainMomentPos(areaId, threadIdx, thread, mi, threadSlotPath, mp),
  );

  // Always route the stroke through resolved moment positions. The catalog-only clip ends at
  // catalogClipT on the slot path, while baseline placement can extrapolate past the tip when
  // MOMENT_ARC_GAP_STRETCH spreads buds — otherwise the line stops short of the last buds.
  const threadMainBaseDraw =
    threadSpec != null ? threadMainPathUntilGlobalT(threadSpec, 1) : threadSlotPath;
  return threadPathThroughMoments(threadMainBaseDraw, momentPoints);
}

export function TreeView() {
  const isDev = process.env.NODE_ENV === "development";
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ type: "none" });
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [hiddenAreaIds, setHiddenAreaIds] = useState<Set<string>>(() => new Set());
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [mockUsers, setMockUsers] = useState<MockUserOption[]>([]);
  const [selectedMockUserId, setSelectedMockUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDev) return;
    void (async () => {
      const res = await fetch("/api/dev/mock-users");
      if (!res.ok) return;
      const payload = (await res.json()) as { users?: MockUserOption[] };
      const users = Array.isArray(payload.users) ? payload.users : [];
      setMockUsers(users);
      const stored = window.localStorage.getItem(MOCK_USER_STORAGE_KEY);
      const fallbackId = users[0]?.id ?? null;
      const chosen = users.some((u) => u.id === stored) ? stored : fallbackId;
      setSelectedMockUserId(chosen);
    })();
  }, [isDev]);

  useEffect(() => {
    if (!isDev || !selectedMockUserId) return;
    window.localStorage.setItem(MOCK_USER_STORAGE_KEY, selectedMockUserId);
  }, [isDev, selectedMockUserId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const userQuery = isDev && selectedMockUserId ? `?userId=${encodeURIComponent(selectedMockUserId)}` : "";
    const [marksRes, branchesRes] = await Promise.all([fetch(`/api/marks${userQuery}`), fetch(`/api/branches${userQuery}`)]);
    const marksJson = (await marksRes.json()) as MarksResponse;
    const branchesJson = (await branchesRes.json()) as BranchesResponse;
    const marks = normalizeMarks(marksJson);
    const branches = normalizeBranches(branchesJson);
    const goals = normalizeGoalsFromBranches(branchesJson);
    setAreas(mapToTreeData(branches, marks, goals));
    setLoading(false);
  }, [isDev, selectedMockUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handler = () => {
      void loadData();
    };
    window.addEventListener("bark:saved", handler);
    return () => window.removeEventListener("bark:saved", handler);
  }, [loadData]);

  const clearAll = useCallback(() => {
    setFocused(null);
    setPanel({ type: "none" });
  }, []);

  const handleAreaClick = useCallback((area: AreaData) => {
    setFocused(area.id);
    setPanel({ type: "area", area });
  }, []);

  const handleThreadClick = useCallback(() => {
    setFocused(null);
    setPanel({ type: "none" });
  }, []);

  const handleMomentClick = useCallback((moment: MomentNode, area: AreaData) => {
    setFocused(area.id);
    setPanel({ type: "moment", moment, area });
  }, []);

  const handleFoundationsClick = useCallback(() => {
    setFocused(null);
    setPanel({ type: "foundations" });
  }, []);

  const visibleAreas = useMemo(
    () => areas.filter((area) => !hiddenAreaIds.has(area.id)),
    [areas, hiddenAreaIds],
  );

  const allThreads = useMemo(
    () => visibleAreas.flatMap((area) => area.threads.map((thread) => ({ area, thread }))),
    [visibleAreas],
  );
  useEffect(() => {
    if (selectedThreadId && allThreads.some((entry) => entry.thread.id === selectedThreadId)) return;
    setSelectedThreadId(allThreads[0]?.thread.id ?? null);
  }, [allThreads, selectedThreadId]);

  const toggleArea = useCallback((areaId: string) => {
    setHiddenAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
    setFocused((curr) => (curr === areaId ? null : curr));
    setPanel((curr) => {
      if (curr.type === "area" && curr.area.id === areaId) return { type: "none" };
      if (curr.type === "moment" && curr.area.id === areaId) return { type: "none" };
      return curr;
    });
  }, []);

  useEffect(() => {
    setHiddenAreaIds((prev) => {
      const validIds = new Set(areas.map((a) => a.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [areas]);

  const treeExportRootRef = useRef<HTMLDivElement | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportTreePdf = useCallback(async () => {
    if (viewMode !== "tree") {
      setViewMode("tree");
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const root = treeExportRootRef.current;
    if (!root) return;
    setExportingPdf(true);
    try {
      const dataUrl = await toPng(root, {
        pixelRatio: 2,
        backgroundColor: "#07060A",
        cacheBust: true,
      });
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("Could not read tree snapshot"));
        img.src = dataUrl;
      });
      const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 32;
      const maxW = pageW - 2 * margin;
      const maxH = pageH - 2 * margin;
      const scale = Math.min(maxW / dims.w, maxH / dims.h);
      const w = dims.w * scale;
      const h = dims.h * scale;
      const x = margin + (maxW - w) / 2;
      const y = margin + (maxH - h) / 2;
      pdf.setProperties({ title: "Pathfinder tree" });
      pdf.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");
      pdf.save(`pathfinder-tree-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      window.alert("Could not export the tree as PDF. Try another browser or zoom the tree slightly and retry.");
    } finally {
      setExportingPdf(false);
    }
  }, [viewMode]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "var(--color-text-tertiary)",
          fontSize: 13,
        }}
      >
        Growing your tree...
      </div>
    );
  }

  return (
    <div className="pf-roadmap min-h-dvh overflow-hidden text-(--rm-text1)">
      <style>{PF_ROADMAP_THEME_CSS}</style>
      <div className="pf-roadmap-shell bg-(--rm-canvas)">
        <PfChromeTopbar shell="roadmap" avatarInitials="PF" avatarTitle="Profile" />
        <aside className="rm-sidebar">
          <PfChromeViewsNav shell="roadmap" />
          <div className="rm-sidebar-divider" />
          <div className="mb-1.5 px-5 text-[10px] font-medium uppercase tracking-wider text-(--rm-text3)">
            Life areas
          </div>
          {areas.map((area) => {
            const off = hiddenAreaIds.has(area.id);
            return (
              <button
                key={area.id}
                type="button"
                className={`rm-tree-toggle${off ? " rm-off" : ""}`}
                onClick={() => toggleArea(area.id)}
              >
                <div className="rm-tree-dot" style={{ background: area.color }} />
                <span className="rm-tree-name">{area.label}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-(--rm-text3)">
                  {area.threads.length}
                </span>
                <div className="rm-toggle-pill" />
              </button>
            );
          })}
        </aside>

        <main className="rm-main">
          <div
            style={{
              padding: "10px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-primary)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: ".1em",
                color: "var(--color-text-tertiary)",
              }}
            >
              TREE VIEW
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {([
                { id: "tree", label: "Tree" },
                { id: "timeline", label: "Timeline" },
                { id: "thread", label: "Thread" },
              ] as const).map((opt) => {
                const active = viewMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setViewMode(opt.id)}
                    style={{
                      fontSize: 11,
                      lineHeight: 1,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "0.5px solid var(--color-border-secondary)",
                      background: active ? "var(--color-background-secondary)" : "transparent",
                      color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => void handleExportTreePdf()}
                disabled={exportingPdf}
                style={{
                  fontSize: 11,
                  lineHeight: 1,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "0.5px solid var(--color-border-secondary)",
                  color: "var(--color-text-secondary)",
                  cursor: exportingPdf ? "wait" : "pointer",
                  background: "transparent",
                  opacity: exportingPdf ? 0.65 : 1,
                }}
              >
                {exportingPdf ? "Exporting…" : "Export PDF"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {focused ? (
                <button
                  onClick={clearAll}
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    background: "none",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 4,
                    cursor: "pointer",
                    padding: "3px 10px",
                  }}
                >
                  ← full tree
                </button>
              ) : (
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>your life map</span>
              )}
              {isDev && mockUsers.length > 0 ? (
                <select
                  value={selectedMockUserId ?? mockUsers[0]?.id ?? ""}
                  onChange={(e) => setSelectedMockUserId(e.target.value)}
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-secondary)",
                    background: "var(--color-background-primary)",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 4,
                    padding: "2px 6px",
                  }}
                >
                  {mockUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {viewMode === "tree" ? (
            <TreeSVG
              areas={visibleAreas}
              mirrorAreas={areas}
              focused={focused}
              panel={panel}
              onClear={clearAll}
              onAreaClick={handleAreaClick}
              onThreadClick={handleThreadClick}
              onMomentClick={handleMomentClick}
              onFoundationsClick={handleFoundationsClick}
              exportRootRef={treeExportRootRef}
            />
          ) : null}
          {viewMode === "timeline" ? (
            <TimelineView
              areas={visibleAreas}
              focused={focused}
              onAreaClick={handleAreaClick}
              onMomentClick={handleMomentClick}
            />
          ) : null}
          {viewMode === "thread" ? (
            <ThreadView
              areas={visibleAreas}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
              onMomentClick={handleMomentClick}
              focused={focused}
              onAreaClick={handleAreaClick}
            />
          ) : null}

          {panel.type !== "none" && (
            <TreePanel
              panel={panel}
              areas={visibleAreas}
              onClose={clearAll}
              onCreateBranchFromMoment={async ({ limbId, parentBranchId, turningPointId, label }) => {
                try {
                  const res = await fetch("/api/branches", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      limbId,
                      label,
                      parentBranchId,
                      turningPointId,
                      mapAngleOffset: 0,
                    }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return { ok: false, error: String(err?.error ?? `Create branch failed (${res.status})`) };
                  }
                  await loadData();
                  return { ok: true };
                } catch {
                  return { ok: false, error: "Network error creating branch." };
                }
              }}
            />
          )}
        </main>
      </div>

      <style jsx global>{`
        .pulse-ring {
          animation: pulse-ring 2.5s ease-in-out infinite;
        }
        @keyframes pulse-ring {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.7;
          }
        }
        @keyframes slideup {
          from {
            transform: translateY(10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .tree-goal-bloom-once {
          animation: tree-goal-bloom-pop 1.5s ease-out forwards;
        }
        @keyframes tree-goal-bloom-pop {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
          }
        }
        .tree-goal-growing-pulse {
          animation: tree-goal-pulse 2.2s ease-in-out infinite;
        }
        @keyframes tree-goal-pulse {
          0%,
          100% {
            opacity: 0.75;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function TreeSVG({
  areas,
  mirrorAreas = areas,
  focused,
  panel,
  onClear,
  onAreaClick,
  onThreadClick,
  onMomentClick,
  onFoundationsClick,
  exportRootRef,
}: TreeSVGProps) {
  const selectedMomentId = panel.type === "moment" ? panel.moment.id : null;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layoutDragRef = useRef<LayoutPointerDrag | null>(null);
  const geometryFileInputRef = useRef<HTMLInputElement | null>(null);
  const renderMarksRef = useRef<number[]>([]);
  /** Per-limb toggles: SVG handles + limb ° input only where enabled. */
  const [layoutEditByAreaId, setLayoutEditByAreaId] = useState<Record<string, boolean>>({});
  const anyLayoutEditActive = useMemo(
    () => Object.values(layoutEditByAreaId).some(Boolean),
    [layoutEditByAreaId],
  );
  const toggleAreaLayoutEdit = useCallback((areaId: string, enabled: boolean) => {
    setLayoutEditByAreaId((prev) => {
      const next = { ...prev };
      if (enabled) next[areaId] = true;
      else delete next[areaId];
      return next;
    });
  }, []);
  const [layoutDevPanelCollapsed, setLayoutDevPanelCollapsed] = useState(false);
  const [layoutOverrides, setLayoutOverrides] = useState(loadLayoutOverrides);
  const resolvedForks = useMemo(
    () =>
      applyLayoutOverrides(AREA_FORKS, deriveRightLimbsFromLeftMirrored(layoutOverrides)),
    [layoutOverrides],
  );
  useEffect(() => {
    saveLayoutOverrides(layoutOverrides);
  }, [layoutOverrides]);

  useEffect(() => {
    if (!TREE_RENDER_STATS_ENABLED || typeof performance === "undefined") return;
    renderMarksRef.current.push(performance.now());
  });

  const initialPanScale = VIEWBOX_WIDTH / 1200;
  const baselineZoomScale = 1.28 * initialPanScale;
  const [transform, setTransform] = useState({
    x: -260 * initialPanScale,
    y: 72 * (VIEWBOX_HEIGHT / 1100),
    scale: baselineZoomScale,
  });
  const zoomRatio = transform.scale / baselineZoomScale;
  const showMarksByZoom = zoomRatio >= 1.5;
  const showAllGoalMilestonesByZoom = zoomRatio >= 2;
  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(() => new Set());
  const [bloomPlayingIds, setBloomPlayingIds] = useState<Set<string>>(() => new Set());
  const prevGoalBloomRef = useRef<Map<string, TreeGoalNode["bloomStatus"]>>(new Map());

  const toggleGoalExpand = useCallback((id: string) => {
    setExpandedGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const current = new Map<string, TreeGoalNode["bloomStatus"]>();
    const walk = (g: TreeGoalNode) => {
      current.set(g.id, g.bloomStatus);
      g.childGoals.forEach(walk);
    };
    areas.forEach((a) => a.threads.forEach((t) => t.goals.forEach(walk)));
    const newly = new Set<string>();
    current.forEach((status, id) => {
      const prev = prevGoalBloomRef.current.get(id);
      if (prev !== undefined && prev !== "BLOOMED" && status === "BLOOMED") newly.add(id);
    });
    prevGoalBloomRef.current = current;
    if (newly.size === 0) return;
    setBloomPlayingIds((prev) => new Set([...prev, ...newly]));
    const timer = window.setTimeout(() => {
      setBloomPlayingIds((prev) => {
        const next = new Set(prev);
        newly.forEach((id) => next.delete(id));
        return next;
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [areas]);

  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const panMoved = useRef(false);

  const beginPan = (x: number, y: number) => {
    setIsPanning(true);
    panMoved.current = false;
    lastPan.current = { x, y };
    panStart.current = { x, y };
  };

  const updatePan = (x: number, y: number) => {
    if (!lastPan.current) return;
    const dx = x - lastPan.current.x;
    const dy = y - lastPan.current.y;
    lastPan.current = { x, y };
    if (panStart.current) {
      const totalDx = x - panStart.current.x;
      const totalDy = y - panStart.current.y;
      if (Math.hypot(totalDx, totalDy) > 5) panMoved.current = true;
    }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  };

  const endPan = () => {
    setIsPanning(false);
    lastPan.current = null;
    panStart.current = null;
  };

  const isLayoutEditHandleTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("[data-layout-edit-handle]"));
  };

  const patchAreaLayout = (areaId: string, patch: Partial<AreaLayoutOverride>) => {
    setLayoutOverrides((prev) => {
      const area = { ...(prev[areaId] ?? {}), ...patch } as AreaLayoutOverride;
      return upsertAreaAndMirror(prev, areaId, area);
    });
  };

  const patchThreadLayout = (areaId: string, threadIdx: number, patch: Partial<ThreadLayoutOverride>) => {
    setLayoutOverrides((prev) => {
      const area = { ...(prev[areaId] ?? {}) } as AreaLayoutOverride;
      const threads = { ...(area.threads ?? {}) };
      threads[threadIdx] = { ...(threads[threadIdx] ?? {}), ...patch };
      applyIntraAreaThreadMirror(areaId, threads, threadIdx);
      area.threads = threads;
      return upsertAreaAndMirror(prev, areaId, area);
    });
  };

  const patchThreadBendAt = (areaId: string, threadIdx: number, bendIndex: number, pt: Point) => {
    setLayoutOverrides((prev) => {
      const mergedForks = applyLayoutOverrides(AREA_FORKS, deriveRightLimbsFromLeftMirrored(prev));
      const baseThread = mergedForks[areaId]?.threads[threadIdx];
      if (!baseThread) return prev;
      const area = { ...(prev[areaId] ?? {}) } as AreaLayoutOverride;
      const threads = { ...(area.threads ?? {}) };
      const cur = { ...(threads[threadIdx] ?? {}) } as ThreadLayoutOverride;
      const defaults = THREAD_LAYOUT_BEND_SAMPLE_TS.map((t) => threadPointAtUniformFraction(baseThread, t));
      let bends: Point[];
      if (cur.bendPoints?.length === THREAD_LAYOUT_BEND_SAMPLE_TS.length)
        bends = cur.bendPoints.map((p) => ({ ...p }));
      else bends = defaults.map((p) => ({ ...p }));
      const idx = Math.max(0, Math.min(THREAD_LAYOUT_BEND_SAMPLE_TS.length - 1, bendIndex));
      bends[idx] = pt;
      const nextCur = { ...cur };
      delete nextCur.bendPoint;
      nextCur.bendPoints = bends;
      threads[threadIdx] = nextCur;
      applyIntraAreaThreadMirror(areaId, threads, threadIdx);
      area.threads = threads;
      return upsertAreaAndMirror(prev, areaId, area);
    });
  };

  const patchMomentLayout = (areaId: string, momentId: string, pt: Point | null) => {
    setLayoutOverrides((prev) => {
      const sourceArea = areas.find((a) => a.id === areaId);
      const sourceThreadIdx = sourceArea?.threads.findIndex((t) => t.moments.some((m) => m.id === momentId)) ?? -1;
      const sourceMomentIdx =
        sourceThreadIdx >= 0
          ? (sourceArea?.threads[sourceThreadIdx]?.moments.findIndex((m) => m.id === momentId) ?? -1)
          : -1;
      const sourceThread = sourceThreadIdx >= 0 ? sourceArea?.threads[sourceThreadIdx] : undefined;
      if (sourceMomentIdx < 0 || !sourceThread || !sourceArea) return prev;

      const upsertMomentPosition = (
        next: Record<string, AreaLayoutOverride>,
        targetAreaId: string,
        targetMomentId: string,
        targetPoint: Point | null,
      ) => {
        const areaPrev = { ...(next[targetAreaId] ?? {}) } as AreaLayoutOverride;
        const momentPositions = { ...(areaPrev.momentPositions ?? {}) };
        if (targetPoint == null) delete momentPositions[targetMomentId];
        else momentPositions[targetMomentId] = targetPoint;
        const areaNext = { ...areaPrev };
        if (Object.keys(momentPositions).length === 0) delete areaNext.momentPositions;
        else areaNext.momentPositions = momentPositions;
        if (hasAreaOverride(areaNext)) next[targetAreaId] = areaNext;
        else delete next[targetAreaId];
      };

      const slotsLocal = getAreaSlotRender(areaId, resolvedForks);
      const slotPathLocal = slotsLocal?.threads[sourceThreadIdx]?.path;
      const sourcePos =
        pt ??
        (slotPathLocal
          ? resolvedChainMomentPos(
              areaId,
              sourceThreadIdx,
              sourceThread,
              sourceMomentIdx,
              slotPathLocal,
              prev[areaId]?.momentPositions,
            )
          : null);
      const mirroredPoint = sourcePos ? mirrorPointAcrossTrunkForLayout(sourcePos) : null;
      const next = { ...prev };
      upsertMomentPosition(next, areaId, momentId, pt);

      const mirrorThreadIdx = intraAreaMirrorPartnerThreadIdx(areaId, sourceThreadIdx);
      const mirroredMomentId =
        mirrorThreadIdx != null ? sourceArea.threads[mirrorThreadIdx]?.moments[sourceMomentIdx]?.id ?? null : null;
      const mirrorThread = mirrorThreadIdx != null ? sourceArea.threads[mirrorThreadIdx] : undefined;
      if (mirroredMomentId && mirrorThread) {
        upsertMomentPosition(next, areaId, mirroredMomentId, pt == null ? null : mirroredPoint);
      }

      const pairAreaId = mirroredPartner(areaId);
      if (pairAreaId) {
        const pairArea = mirrorAreas.find((a) => a.id === pairAreaId);
        const pairMomentId = pairArea?.threads[sourceThreadIdx]?.moments[sourceMomentIdx]?.id ?? null;
        if (pairMomentId) {
          upsertMomentPosition(next, pairAreaId, pairMomentId, pt == null ? null : mirroredPoint);
        }
      }

      return next;
    });
  };

  const releaseLayoutPointer = (e: PointerEvent<SVGCircleElement>) => {
    const d = layoutDragRef.current;
    if (d?.pointerId === e.pointerId) {
      if (d.kind === "threadFork") {
        const areaData = areas.find((a) => a.id === d.areaId);
        const ids = areaData?.threads[d.threadIdx]?.moments.map((m) => m.id) ?? [];
        setLayoutOverrides((prev) => {
          const areaPrev = { ...(prev[d.areaId] ?? {}) } as AreaLayoutOverride;
          const momentPositions = { ...(areaPrev.momentPositions ?? {}) };
          for (const id of ids) delete momentPositions[id];
          const areaNext = { ...areaPrev };
          if (Object.keys(momentPositions).length === 0) delete areaNext.momentPositions;
          else areaNext.momentPositions = momentPositions;
          const next = { ...prev };
          if (hasAreaOverride(areaNext)) next[d.areaId] = areaNext;
          else delete next[d.areaId];
          return next;
        });
      }
      layoutDragRef.current = null;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const viewWidth = VIEWBOX_WIDTH;
  const viewHeight = VIEWBOX_HEIGHT;
  const gridStep = 100;
  const gridXs = Array.from({ length: Math.floor(viewWidth / gridStep) + 1 }, (_, i) => i * gridStep);
  const gridYs = Array.from({ length: Math.floor(viewHeight / gridStep) + 1 }, (_, i) => i * gridStep);

  return (
    <div style={{ width: "100%", height: "calc(100vh - 48px)", overflow: "hidden", display: "block", position: "relative", background: "#07060A" }}>
      {TREE_RENDER_STATS_ENABLED ? <TreeRenderStatsHud marksRef={renderMarksRef} /> : null}
      <div ref={exportRootRef} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width="100%"
        height="100%"
        style={{
          background: "#07060A",
          cursor: anyLayoutEditActive && TREE_LAYOUT_EDIT_ENABLED ? "default" : isPanning ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onWheel={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const newScale = Math.min(3, Math.max(0.3, transform.scale * delta));
          const cx = ((e.clientX - rect.left) / rect.width) * viewWidth;
          const cy = ((e.clientY - rect.top) / rect.height) * viewHeight;
          setTransform((t) => ({
            scale: newScale,
            x: cx - (cx - t.x) * (newScale / t.scale),
            y: cy - (cy - t.y) * (newScale / t.scale),
          }));
        }}
        onMouseDown={(e) => {
          if (anyLayoutEditActive && TREE_LAYOUT_EDIT_ENABLED && isLayoutEditHandleTarget(e.target)) return;
          if (e.button !== 0) return;
          beginPan(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          if (!isPanning || !lastPan.current) return;
          updatePan(e.clientX, e.clientY);
        }}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (!touch) return;
          if (anyLayoutEditActive && TREE_LAYOUT_EDIT_ENABLED && isLayoutEditHandleTarget(touch.target)) return;
          beginPan(touch.clientX, touch.clientY);
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (!touch || !isPanning) return;
          e.preventDefault();
          updatePan(touch.clientX, touch.clientY);
        }}
        onTouchEnd={endPan}
        onClick={() => {
          if (panMoved.current) return;
          onClear();
        }}
      >
        <defs>
          <linearGradient id="trunkBodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B2E1A" />
            <stop offset="60%" stopColor="#261E0F" />
            <stop offset="100%" stopColor="#14100A" />
          </linearGradient>
        </defs>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          <g
            transform={`translate(${TREE_TRUNK_MIRROR_X}, ${TREE_LAYOUT_SCALE_ORIGIN_Y}) scale(${TREE_LAYOUT_WORLD_SCALE}) translate(${-TREE_TRUNK_MIRROR_X}, ${-TREE_LAYOUT_SCALE_ORIGIN_Y})`}
          >
          {/* Single tapered trunk — replaces the 3 stroked paths */}
          <path
            d={`M599,432 
   C596,520 590,700 586,950 
   C583,1100 582,1220 584,1340 
   C588,1348 594,1354 600,1356 
   C606,1354 612,1348 616,1340 
   C618,1220 617,1100 614,950 
   C610,700 604,520 601,432 Z`}
            fill="url(#trunkBodyGrad)"
          />

          <path d="M600,1355 C555,1365 505,1375 458,1387" fill="none" stroke="#2A2318" strokeWidth={9} strokeLinecap="round" />
          <path d="M600,1355 C645,1365 695,1375 742,1387" fill="none" stroke="#2A2318" strokeWidth={9} strokeLinecap="round" />
          <path d="M458,1387 C428,1397 400,1407 376,1417" fill="none" stroke="#1E1A12" strokeWidth={5} strokeLinecap="round" />
          <path d="M742,1387 C772,1397 800,1407 824,1417" fill="none" stroke="#1E1A12" strokeWidth={5} strokeLinecap="round" />
          <path d="M520,1370 C494,1380 470,1392 450,1403" fill="none" stroke="#1A1610" strokeWidth={4} strokeLinecap="round" />
          <path d="M680,1370 C706,1380 730,1392 750,1403" fill="none" stroke="#1A1610" strokeWidth={4} strokeLinecap="round" />
          <text
            x="600"
            y="1387"
            textAnchor="middle"
            fontSize={9}
            fontWeight={500}
            letterSpacing={5}
            fill="#3A3228"
            fontFamily="Georgia,serif"
            opacity={0.7}
            onClick={(e) => {
              e.stopPropagation();
              if (panMoved.current) return;
              onFoundationsClick();
            }}
            style={{ cursor: "pointer" }}
          >
            FOUNDATIONS
          </text>

          {areas.map((area) => {
            const slots = getAreaSlotRender(area.id, resolvedForks);
            if (!slots) return null;
            const cfg = AREA_LABEL_CONFIG[area.id];
            const forkSpec = resolvedForks[area.id];
            const limbTip = forkSpec ? limbStrokeEndPoint(forkSpec) : pathEnd(slots.limb);
            return (
              <g
                key={area.id}
                style={{
                  opacity: getOpacity(focused, area.id),
                  transition: "opacity 300ms ease",
                }}
              >
                {/* Base layer — wide, low opacity, gives trunk-end weight */}
                <path d={slots.limb} fill="none" stroke={area.color} strokeWidth={slots.limbStrokeWidth * 2.2} strokeLinecap="round" opacity={0.18} pointerEvents="none" />
                {/* Mid layer */}
                <path d={slots.limb} fill="none" stroke={area.color} strokeWidth={slots.limbStrokeWidth * 1.3} strokeLinecap="round" opacity={0.55} pointerEvents="none" />
                {/* Tip layer — thin, high opacity, reads as the fine end */}
                <path d={slots.limb} fill="none" stroke={area.color} strokeWidth={slots.limbStrokeWidth * 0.45} strokeLinecap="round" opacity={0.95} pointerEvents="none" />
                <path
                  d={slots.limb}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={slots.limbStrokeWidth + 12}
                  strokeLinecap="round"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (panMoved.current) return;
                    onAreaClick(area);
                  }}
                  style={{ cursor: "pointer" }}
                />

                {area.threads.map((thread, idx) => {
                  const threadSlot = slots.threads[idx];
                  if (!threadSlot) return null;
                  const threadOpacity = focused === area.id ? 0.88 : 0.85;
                  const threadSpec = forkSpec?.threads[idx];
                  const threadMainDraw = buildRenderedThreadMainPath(
                    area.id,
                    idx,
                    thread,
                    threadSlot.path,
                    threadSpec,
                    layoutOverrides[area.id],
                  );
                  const momentCount = Math.max(1, thread.moments.length);

                  return (
                    <g key={thread.id}>
                      <path d={threadMainDraw} fill="none" stroke={area.color} strokeWidth={threadSlot.strokeWidth} strokeLinecap="round" opacity={threadOpacity} pointerEvents="none" />
                      <path
                        d={threadMainDraw}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={threadSlot.strokeWidth + 8}
                        strokeLinecap="round"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (panMoved.current) return;
                          onThreadClick(thread.id);
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      {thread.siblings && thread.siblings.length > 0 ? (() => {
                        const split = Math.min(0.9, Math.max(0.2, thread.splitT ?? 0.58));
                        const splitPos = pathPointAtT(threadMainDraw, split);
                        const sBefore = Math.max(0, split - 0.04);
                        const sAfter = Math.min(1, split + 0.04);
                        const pBefore = pathPointAtT(threadMainDraw, sBefore);
                        const pAfter = pathPointAtT(threadMainDraw, sAfter);
                        const vx = pAfter.x - pBefore.x;
                        const vy = pAfter.y - pBefore.y;
                        const vLen = Math.hypot(vx, vy) || 1;
                        const tx = vx / vLen;
                        const ty = vy / vLen;
                        const side = splitPos.x < TREE_TRUNK_MIRROR_X ? -1 : 1;
                        const nxRaw = -ty;
                        const nyRaw = tx;
                        const nx = Math.abs(nxRaw) * side;
                        const ny = nyRaw;
                        return (
                          <g>
                            {thread.siblings.map((sib, sibIdx) => {
                              const fan = thread.siblings!.length === 1
                                ? 0
                                : (sibIdx / (thread.siblings!.length - 1)) * 2 - 1;
                              const dist = 48 + sibIdx * 4;
                              const along = 18 + Math.abs(fan) * 10;
                              const childPos = {
                                x: splitPos.x + nx * dist + tx * along * 0.3,
                                y: splitPos.y + ny * dist + ty * along * fan * 0.5,
                              };
                              const ctrl = {
                                x: splitPos.x + nx * (dist * 0.55) + tx * along * 0.45,
                                y: splitPos.y + ny * (dist * 0.55) + ty * along * fan * 0.7,
                              };
                              const childPath = `M${splitPos.x},${splitPos.y} Q${ctrl.x},${ctrl.y} ${childPos.x},${childPos.y}`;
                              return (
                                <g key={`${thread.id}-sib-${sib.id}`}>
                                  <path d={childPath} fill="none" stroke={area.color} strokeWidth={thread.postSplitStrokeWidth ?? Math.max(1.2, threadSlot.strokeWidth * 0.7)} opacity={0.8} strokeLinecap="round" pointerEvents="none" />
                                  <circle cx={childPos.x} cy={childPos.y} r={3.2} fill={area.color} opacity={0.92} pointerEvents="none" />
                                </g>
                              );
                            })}
                          </g>
                        );
                      })() : null}

                      {thread.goals.length > 0
                        ? thread.goals.map((g, gi) => {
                            const t = goalTAlongThread(g, gi, thread.goals.length);
                            const pos = pathPointAtT(threadMainDraw, t);
                            return (
                              <g key={g.id}>
                                {renderGoalsSubtree(
                                  g,
                                  pos,
                                  area.color,
                                  expandedGoalIds,
                                  showAllGoalMilestonesByZoom,
                                  bloomPlayingIds,
                                  toggleGoalExpand,
                                  0,
                                )}
                              </g>
                            );
                          })
                        : null}

                      {showMarksByZoom
                        ? thread.moments.map((moment, momentIdx) => {
                        const isSelected = selectedMomentId === moment.id;
                        const isGrowing = moment.bloomStatus === "GROWING" || moment.future;
                        const isEnded = moment.bloomStatus === "ENDED";
                        const isFlower = moment.isTurningPoint && moment.bloomStatus === "BLOOMED";
                        const r = nodeRadius(moment.significance);

                        const pos = resolvedChainMomentPos(
                          area.id,
                          idx,
                          thread,
                          momentIdx,
                          threadSlot.path,
                          layoutOverrides[area.id]?.momentPositions,
                        );
                        const miLo = Math.max(0, momentIdx - 1);
                        const miHi = Math.min(momentCount - 1, momentIdx + 1);
                        const pBefore = resolvedChainMomentPos(
                          area.id,
                          idx,
                          thread,
                          miLo,
                          threadSlot.path,
                          layoutOverrides[area.id]?.momentPositions,
                        );
                        const pAfter = resolvedChainMomentPos(
                          area.id,
                          idx,
                          thread,
                          miHi,
                          threadSlot.path,
                          layoutOverrides[area.id]?.momentPositions,
                        );
                        let dx = pAfter.x - pBefore.x;
                        let dy = pAfter.y - pBefore.y;
                        if (dx * dx + dy * dy < 1e-12) {
                          const tc = momentCatalogClipGlobalT(threadSlot.path, momentCount);
                          const q0 = pathPointAtT(threadSlot.path, Math.max(0, tc - 0.06));
                          const q1 = pathPointAtT(threadSlot.path, Math.min(1, tc + 0.06));
                          dx = q1.x - q0.x;
                          dy = q1.y - q0.y;
                        }
                        const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        let nx = -dy / len;
                        let ny = dx / len;
                        if (
                          (pos.x < TREE_TRUNK_MIRROR_X && nx > 0) ||
                          (pos.x > TREE_TRUNK_MIRROR_X && nx < 0)
                        ) {
                          nx = -nx;
                          ny = -ny;
                        }
                        const labelXMoment = pos.x + nx * (r + 5);
                        const labelYMoment = pos.y + ny * (r + 5) + 3;
                        const labelAnchor = nx < 0 ? "end" : "start";
                        const threadShapeIdx = idx % 4;
                        const renderMomentShape = (fill: string, opacity: number) => {
                          if (threadShapeIdx === 1) {
                            return (
                              <rect
                                width={r * 1.4}
                                height={r * 1.4}
                                x={pos.x - r * 0.7}
                                y={pos.y - r * 0.7}
                                transform={`rotate(45,${pos.x},${pos.y})`}
                                fill={fill}
                                opacity={opacity}
                                pointerEvents="none"
                              />
                            );
                          }
                          if (threadShapeIdx === 2) {
                            return (
                              <rect
                                width={r * 1.4}
                                height={r * 1.4}
                                x={pos.x - r * 0.7}
                                y={pos.y - r * 0.7}
                                fill={fill}
                                opacity={opacity}
                                pointerEvents="none"
                              />
                            );
                          }
                          if (threadShapeIdx === 3) {
                            const topY = pos.y - r * 0.95;
                            const leftX = pos.x - r * 0.9;
                            const rightX = pos.x + r * 0.9;
                            const baseY = pos.y + r * 0.9;
                            return (
                              <polygon
                                points={`${pos.x},${topY} ${leftX},${baseY} ${rightX},${baseY}`}
                                fill={fill}
                                opacity={opacity}
                                pointerEvents="none"
                              />
                            );
                          }
                          return (
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={r}
                              fill={fill}
                              opacity={opacity}
                              pointerEvents="none"
                            />
                          );
                        };

                        return (
                          <g
                            key={moment.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (panMoved.current) return;
                              onMomentClick(moment, area);
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <g>
                              {isFlower ? (
                                <>
                                  {[0, 1, 2, 3, 4, 5].map((i) => {
                                    const angle = (i / 6) * Math.PI * 2;
                                    const px = pos.x + Math.cos(angle) * 9;
                                    const py = pos.y + Math.sin(angle) * 9;
                                    return (
                                      <ellipse
                                        key={`${moment.id}-petal-${i}`}
                                        cx={px}
                                        cy={py}
                                        rx={2.8}
                                        ry={7}
                                        transform={`rotate(${(angle * 180) / Math.PI + 90},${px},${py})`}
                                        fill={area.color}
                                        opacity={0.9}
                                        pointerEvents="none"
                                      />
                                    );
                                  })}
                                  <circle cx={pos.x} cy={pos.y} r={5} fill="#FAC775" pointerEvents="none" />
                                  <circle cx={pos.x} cy={pos.y} r={2.5} fill="#EF9F27" pointerEvents="none" />
                                </>
                              ) : isEnded ? (
                                <>
                                  {renderMomentShape("#181412", 0.85)}
                                  <line x1={pos.x - 5} y1={pos.y - 5} x2={pos.x + 5} y2={pos.y + 5} stroke={area.color} strokeWidth={1.8} opacity={0.45} />
                                  <line x1={pos.x + 5} y1={pos.y - 5} x2={pos.x - 5} y2={pos.y + 5} stroke={area.color} strokeWidth={1.8} opacity={0.45} />
                                </>
                              ) : isGrowing ? (
                                <>
                                  <circle cx={pos.x} cy={pos.y} r={r + 4} fill="none" stroke={area.color} strokeWidth={1.2} opacity={0.4} className="pulse-ring" />
                                  {renderMomentShape(area.color, 0.65)}
                                </>
                              ) : (
                                renderMomentShape(area.color, 0.85)
                              )}
                            </g>
                            {isSelected ? <circle cx={pos.x} cy={pos.y} r={11} fill="none" stroke="#D1CEC4" strokeWidth={1} opacity={0.22} /> : null}
                            {TREE_MOMENT_DEV_LABELS_ENABLED ? (
                              <text
                                x={labelXMoment}
                                y={labelYMoment}
                                textAnchor={labelAnchor}
                                fontSize={6.5}
                                fontWeight={450}
                                fill="#78716C"
                                fillOpacity={0.72}
                                stroke="#020617"
                                strokeWidth={0.65}
                                strokeOpacity={0.35}
                                paintOrder="stroke fill"
                                pointerEvents="none"
                                style={{ fontFamily: "ui-monospace, monospace" }}
                              >
                                {`${moment.label.slice(0, 3)}·${moment.id.slice(0, 3)}`}
                              </text>
                            ) : null}
                            {TREE_LAYOUT_EDIT_ENABLED && layoutEditByAreaId[area.id] ? (
                              <circle
                                data-layout-edit-handle="1"
                                cx={pos.x}
                                cy={pos.y}
                                r={Math.max(r + 10, 14)}
                                fill="rgba(34,211,238,0.06)"
                                stroke="#22D3EE"
                                strokeWidth={1.5}
                                style={{ cursor: "grab", touchAction: "none" }}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  layoutDragRef.current = {
                                    kind: "moment",
                                    areaId: area.id,
                                    momentId: moment.id,
                                    pointerId: e.pointerId,
                                    startClientX: e.clientX,
                                    startClientY: e.clientY,
                                  };
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                }}
                                onPointerMove={(e) => {
                                  const drag = layoutDragRef.current;
                                  if (
                                    !drag ||
                                    drag.kind !== "moment" ||
                                    drag.areaId !== area.id ||
                                    drag.momentId !== moment.id ||
                                    drag.pointerId !== e.pointerId ||
                                    !svgRef.current
                                  ) {
                                    return;
                                  }
                                  if (!hasCrossedLayoutDragThreshold(drag, e.clientX, e.clientY)) return;
                                  const worldPt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                                  patchMomentLayout(area.id, moment.id, worldPt);
                                }}
                                onPointerUp={releaseLayoutPointer}
                                onPointerCancel={releaseLayoutPointer}
                              />
                            ) : null}
                          </g>
                        );
                      })
                        : null}
                    </g>
                  );
                })}

                <text
                  x={limbTip.x + cfg.dx}
                  y={limbTip.y + cfg.dy}
                  textAnchor={cfg.anchor}
                  fontSize={11.5}
                  fontWeight={500}
                  letterSpacing=".02em"
                  fill={area.color}
                  opacity={0.92}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (panMoved.current) return;
                    onAreaClick(area);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {area.label}
                </text>
              </g>
            );
          })}
          <g pointerEvents="none">
            {gridXs.map((x) => (
              <line
                key={`grid-x-${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={viewHeight}
                stroke="#9CA3AF"
                strokeWidth={0.6}
                opacity={0.24}
              />
            ))}
            {gridYs.map((y) => (
              <line
                key={`grid-y-${y}`}
                x1={0}
                y1={y}
                x2={viewWidth}
                y2={y}
                stroke="#9CA3AF"
                strokeWidth={0.6}
                opacity={0.24}
              />
            ))}
            {gridXs.flatMap((x) =>
              gridYs.map((y) => (
                <circle key={`grid-dot-${x}-${y}`} cx={x} cy={y} r={1.6} fill="#9CA3AF" opacity={0.45} />
              )),
            )}
            {areas.map((area) => {
              const spec = resolvedForks[area.id];
              if (!spec) return null;
              const lt = limbStrokeEndPoint(spec);
              return (
                <g key={`debug-geom-${area.id}`}>
                  <circle cx={spec.trunkAttach.x} cy={spec.trunkAttach.y} r={4} fill="#FFFFFF" opacity={0.95} />
                  <circle cx={lt.x} cy={lt.y} r={3} fill={area.color} opacity={0.95} />
                  {spec.threads.map((th, ti) => (
                    <g key={`debug-geom-${area.id}-th-${ti}`}>
                      <circle cx={th.forkPoint.x} cy={th.forkPoint.y} r={3} fill={area.color} opacity={0.92} />
                      <circle cx={th.tip.x} cy={th.tip.y} r={2} fill={area.color} opacity={0.85} />
                    </g>
                  ))}
                  {area.threads.map((thread) => (
                    <g key={`debug-spine-${area.id}-${thread.id}`}>
                      <circle cx={thread.p1.x} cy={thread.p1.y} r={4.4} fill="#FBBF24" opacity={0.95} />
                      <circle cx={thread.p2.x} cy={thread.p2.y} r={4.4} fill="#F472B6" opacity={0.95} />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
          {TREE_LAYOUT_EDIT_ENABLED
            ? areas.flatMap((area) => {
                if (!layoutEditByAreaId[area.id]) return [];
                const fs = resolvedForks[area.id];
                if (!fs) return [];
                const limbTipPt = limbStrokeEndPoint(fs);
                const limbC2 = fs.limbPieces[0]?.c2;
                const limbNodes = [
                  <g key={`layout-limb-tip-${area.id}`} data-layout-edit-handle="1">
                    <circle
                      cx={limbTipPt.x}
                      cy={limbTipPt.y}
                      r={12}
                      fill="rgba(52, 211, 153, 0.28)"
                      stroke="#34D399"
                      strokeWidth={2}
                      style={{ cursor: "grab", touchAction: "none" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        layoutDragRef.current = {
                          kind: "limbTip",
                          areaId: area.id,
                          pointerId: e.pointerId,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                        };
                        (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const d = layoutDragRef.current;
                        if (!d || d.kind !== "limbTip" || d.areaId !== area.id || d.pointerId !== e.pointerId || !svgRef.current) return;
                        if (!hasCrossedLayoutDragThreshold(d, e.clientX, e.clientY)) return;
                        const pt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                        patchAreaLayout(area.id, { limbTip: pt });
                      }}
                      onPointerUp={releaseLayoutPointer}
                      onPointerCancel={releaseLayoutPointer}
                    />
                  </g>,
                ];
                if (limbC2) {
                  limbNodes.push(
                    <g key={`layout-limb-c2-${area.id}`} data-layout-edit-handle="1">
                      <circle
                        cx={limbC2.x}
                        cy={limbC2.y}
                        r={11}
                        fill="rgba(96, 165, 250, 0.3)"
                        stroke="#60A5FA"
                        strokeWidth={2}
                        style={{ cursor: "grab", touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          layoutDragRef.current = {
                            kind: "limbC2",
                            areaId: area.id,
                            pointerId: e.pointerId,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                          };
                          (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const d = layoutDragRef.current;
                          if (!d || d.kind !== "limbC2" || d.areaId !== area.id || d.pointerId !== e.pointerId || !svgRef.current) return;
                          if (!hasCrossedLayoutDragThreshold(d, e.clientX, e.clientY)) return;
                          const pt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                          patchAreaLayout(area.id, { limbFirstC2: pt });
                        }}
                        onPointerUp={releaseLayoutPointer}
                        onPointerCancel={releaseLayoutPointer}
                      />
                    </g>,
                  );
                }
                const threadNodes = fs.threads.flatMap((th, ti) => {
                  const pivot = th.forkPoint;
                  const rx = pivot.x + 22 + ti * 2;
                  const ry = pivot.y - 14 - ti * 2;
                  const bendPtsRaw = layoutOverrides[area.id]?.threads?.[ti]?.bendPoints;
                  const bendPts =
                    bendPtsRaw?.length === THREAD_LAYOUT_BEND_SAMPLE_TS.length
                      ? bendPtsRaw
                      : threadDefaultBendHandlePoints(th);
                  return [
                    <g key={`layout-fork-${area.id}-${ti}`} data-layout-edit-handle="1">
                      <circle
                        cx={th.forkPoint.x}
                        cy={th.forkPoint.y}
                        r={14}
                        fill="rgba(251, 191, 36, 0.22)"
                        stroke="#FBBF24"
                        strokeWidth={2}
                        style={{ cursor: "grab", touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          layoutDragRef.current = {
                            kind: "threadFork",
                            areaId: area.id,
                            threadIdx: ti,
                            pointerId: e.pointerId,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                          };
                          (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const d = layoutDragRef.current;
                          if (
                            !d ||
                            d.kind !== "threadFork" ||
                            d.areaId !== area.id ||
                            d.threadIdx !== ti ||
                            d.pointerId !== e.pointerId ||
                            !svgRef.current
                          ) {
                            return;
                          }
                          if (!hasCrossedLayoutDragThreshold(d, e.clientX, e.clientY)) return;
                          const pt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                          const resolvedAreaSpec = resolvedForks[area.id];
                          const t = closestGlobalTOnLimb(resolvedAreaSpec, pt);
                          const snappedPt = limbPointAtUniformFraction(resolvedAreaSpec, t);
                          patchThreadLayout(area.id, ti, { forkPoint: snappedPt });
                        }}
                        onPointerUp={releaseLayoutPointer}
                        onPointerCancel={releaseLayoutPointer}
                      />
                    </g>,
                    <g key={`layout-thread-rot-${area.id}-${ti}`} data-layout-edit-handle="1">
                      <circle
                        cx={rx}
                        cy={ry}
                        r={9}
                        fill="rgba(167, 139, 250, 0.35)"
                        stroke="#A78BFA"
                        strokeWidth={2}
                        style={{ cursor: "alias", touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!svgRef.current) return;
                          const pt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                          const startAngle = Math.atan2(pt.y - pivot.y, pt.x - pivot.x);
                          const baseRotateDeg = layoutOverrides[area.id]?.threads?.[ti]?.rotateDeg ?? 0;
                          layoutDragRef.current = {
                            kind: "threadRotate",
                            areaId: area.id,
                            threadIdx: ti,
                            pointerId: e.pointerId,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            pivot,
                            startAngle,
                            baseRotateDeg,
                          };
                          (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const d = layoutDragRef.current;
                          if (
                            !d ||
                            d.kind !== "threadRotate" ||
                            d.areaId !== area.id ||
                            d.threadIdx !== ti ||
                            d.pointerId !== e.pointerId ||
                            !svgRef.current
                          ) {
                            return;
                          }
                          if (!hasCrossedLayoutDragThreshold(d, e.clientX, e.clientY)) return;
                          const pt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                          const ang = Math.atan2(pt.y - d.pivot.y, pt.x - d.pivot.x);
                          const deltaDeg = ((ang - d.startAngle) * 180) / Math.PI;
                          patchThreadLayout(area.id, ti, { rotateDeg: d.baseRotateDeg + deltaDeg });
                        }}
                        onPointerUp={releaseLayoutPointer}
                        onPointerCancel={releaseLayoutPointer}
                      />
                    </g>,
                    ...bendPts.map((bendPt, bi) => (
                      <g key={`layout-thread-bend-${area.id}-${ti}-${bi}`} data-layout-edit-handle="1">
                        <circle
                          cx={bendPt.x}
                          cy={bendPt.y}
                          r={9}
                          fill={`rgba(45, 212, 191, ${0.22 + bi * 0.05})`}
                          stroke={bi === 1 ? "#5EEAD4" : "#2DD4BF"}
                          strokeWidth={2}
                          style={{ cursor: "grab", touchAction: "none" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            layoutDragRef.current = {
                              kind: "threadBend",
                              areaId: area.id,
                              threadIdx: ti,
                              bendIndex: bi,
                              pointerId: e.pointerId,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                            };
                            (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            const d = layoutDragRef.current;
                            if (
                              !d ||
                              d.kind !== "threadBend" ||
                              d.areaId !== area.id ||
                              d.threadIdx !== ti ||
                              d.bendIndex !== bi ||
                              d.pointerId !== e.pointerId ||
                              !svgRef.current
                            ) {
                              return;
                            }
                            if (!hasCrossedLayoutDragThreshold(d, e.clientX, e.clientY)) return;
                            const pt = clientToWorldSvg(svgRef.current, e.clientX, e.clientY, viewWidth, viewHeight, transform);
                            patchThreadBendAt(area.id, ti, bi, pt);
                          }}
                          onPointerUp={releaseLayoutPointer}
                          onPointerCancel={releaseLayoutPointer}
                        />
                      </g>
                    )),
                  ];
                });
                return [...limbNodes, ...threadNodes];
              })
            : null}
          </g>
        </g>
      </svg>
      </div>
      {TREE_LAYOUT_EDIT_ENABLED ? (
        <div
          style={{
            position: "absolute",
            left: 10,
            top: TREE_RENDER_STATS_ENABLED ? 52 : 10,
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: layoutDevPanelCollapsed ? "8px 10px" : "10px 12px",
            borderRadius: 12,
            background: "rgba(15, 14, 20, 0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
            maxWidth: 420,
            fontSize: 12,
            color: "#E7E5E4",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontWeight: 600, color: "#FBBF24" }}>Tree layout (dev)</span>
            <button
              type="button"
              aria-expanded={!layoutDevPanelCollapsed}
              aria-controls={!layoutDevPanelCollapsed ? "tree-layout-dev-panel-body" : undefined}
              onClick={() => setLayoutDevPanelCollapsed((c) => !c)}
              style={{
                flexShrink: 0,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#FAFAF9",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {layoutDevPanelCollapsed ? "Expand" : "Collapse"}
            </button>
          </div>
          {!layoutDevPanelCollapsed ? (
            <div id="tree-layout-dev-panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setLayoutOverrides((prev) => {
                    const mergedForks = applyLayoutOverrides(
                      AREA_FORKS,
                      deriveRightLimbsFromLeftMirrored(prev),
                    );
                    let maxMoments = 0;
                    let shortestArc = Infinity;
                    for (const area of areas) {
                      const slots = getAreaSlotRender(area.id, mergedForks);
                      if (!slots) continue;
                      for (let ti = 0; ti < area.threads.length; ti += 1) {
                        const thread = area.threads[ti];
                        const n = thread.moments.length;
                        maxMoments = Math.max(maxMoments, n);
                        if (n < 2) continue;
                        const path = slots.threads[ti]?.path;
                        if (!path) continue;
                        const L = arcLengthMomentStationSegment(path);
                        if (L > 1e-9) shortestArc = Math.min(shortestArc, L);
                      }
                    }
                    if (maxMoments < 2 || shortestArc === Infinity || shortestArc < 1e-9) return prev;
                    const D = shortestArc / (maxMoments - 1);
                    const next = { ...prev };
                    for (const area of areas) {
                      const slots = getAreaSlotRender(area.id, mergedForks);
                      if (!slots) continue;
                      const momentPositions: Record<string, Point> = {};
                      for (let ti = 0; ti < area.threads.length; ti += 1) {
                        const thread = area.threads[ti];
                        const path = slots.threads[ti]?.path;
                        if (!path) continue;
                        for (let mi = 0; mi < thread.moments.length; mi += 1) {
                          const m = thread.moments[mi];
                          const arcOffset = mi * D;
                          momentPositions[m.id] = momentPositionAtArcOffsetFromStationLo(path, arcOffset);
                        }
                      }
                      if (Object.keys(momentPositions).length === 0) continue;
                      const areaPrev = { ...(next[area.id] ?? {}) } as AreaLayoutOverride;
                      areaPrev.momentPositions = momentPositions;
                      if (hasAreaOverride(areaPrev)) next[area.id] = areaPrev;
                      else delete next[area.id];
                    }
                    return next;
                  });
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(52, 211, 153, 0.12)",
                  color: "#A7F3D0",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Distribute all evenly
              </button>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "8px 9px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
              <span style={{ fontSize: 11, color: "#A8A29E", lineHeight: 1.45 }}>
                Turn on <strong style={{ color: "#E7E5E4", fontWeight: 600 }}>Edit layout</strong> per limb below to show handles on the tree (teal bends, yellow fork, purple rotate, cyan moments). Drag those handles or set limb rotation ° for that limb. Overrides auto-save locally; use import/export between sessions.
              </span>
              </div>
            <div
              style={{
                maxHeight: 260,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "8px 9px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span style={{ fontSize: 10, color: "#A8A29E", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                Limb layout
              </span>
              {areas.map((a, limbIdx) => (
                <div
                  key={`limb-layout-${a.id}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingBottom: limbIdx < areas.length - 1 ? 6 : 0,
                    borderBottom: limbIdx < areas.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(layoutEditByAreaId[a.id])}
                      onChange={(e) => toggleAreaLayoutEdit(a.id, e.target.checked)}
                    />
                    <span style={{ color: "#FAFAF9", fontWeight: 500 }}>{a.label}</span>
                    <span style={{ color: "#78716C", fontSize: 10 }}>Edit layout</span>
                  </label>
                  {layoutEditByAreaId[a.id] ? (
                    <label
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, paddingLeft: 22 }}
                    >
                      <span style={{ color: "#D6D3D1", flex: 1, minWidth: 0 }}>Limb rotation °</span>
                      <input
                        type="number"
                        step={1}
                        value={layoutOverrides[a.id]?.limbRotateDeg ?? ""}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLayoutOverrides((prev) => {
                            const cur = { ...(prev[a.id] ?? {}) } as AreaLayoutOverride;
                            if (raw === "") {
                              delete cur.limbRotateDeg;
                            } else {
                              const n = Number(raw);
                              if (!Number.isNaN(n)) cur.limbRotateDeg = n;
                            }
                            return upsertAreaAndMirror(prev, a.id, cur);
                          });
                        }}
                        style={{
                          width: 72,
                          padding: "4px 6px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: "rgba(0,0,0,0.35)",
                          color: "#FAFAF9",
                          fontSize: 11,
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "8px 9px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setLayoutOverrides((prev) => {
                  const next = { ...prev };
                  for (const ar of areas) {
                    const areaPrev = { ...(next[ar.id] ?? {}) } as AreaLayoutOverride;
                    let mp = { ...(areaPrev.momentPositions ?? {}) };
                    for (const th of ar.threads) {
                      for (const m of th.moments) delete mp[m.id];
                    }
                    const areaNext = { ...areaPrev };
                    if (Object.keys(mp).length === 0) delete areaNext.momentPositions;
                    else areaNext.momentPositions = mp;
                    if (hasAreaOverride(areaNext)) next[ar.id] = areaNext;
                    else delete next[ar.id];
                  }
                  return next;
                });
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(52, 211, 153, 0.12)",
                color: "#A7F3D0",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Reset all chains
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
            <span style={{ width: "100%", fontSize: 10, color: "#A8A29E", letterSpacing: "0.03em", textTransform: "uppercase" }}>
              Data and transfer
            </span>
            <button
              type="button"
              onClick={() => {
                setLayoutOverrides({});
                saveLayoutOverrides({});
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#FAFAF9",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Reset layout
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(JSON.stringify(layoutOverrides, null, 2));
                } catch {
                  /* */
                }
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#FAFAF9",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Copy overrides JSON
            </button>
            <input
              ref={geometryFileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed: unknown = JSON.parse(text);
                  const ov = parseLayoutOverridesFromJson(parsed);
                  if (!ov) {
                    console.warn("[tree layout] Import: expected layoutOverrides or export object");
                    return;
                  }
                  setLayoutOverrides(ov);
                } catch (err) {
                  console.warn("[tree layout] Import failed", err);
                }
              }}
            />
            <button
              type="button"
              onClick={() => geometryFileInputRef.current?.click()}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#FAFAF9",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Import geometry…
            </button>
            <button
              type="button"
              onClick={() => {
                const ov = getDefaultLayoutOverrides();
                setLayoutOverrides(ov);
                saveLayoutOverrides(ov);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(251, 191, 36, 0.12)",
                color: "#FDE68A",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Reset to shipped geometry
            </button>
            <button
              type="button"
              onClick={() => {
                const payload = {
                  exportedAt: new Date().toISOString(),
                  layoutOverrides,
                  resolvedForks,
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "pathfinder-tree-geometry.json";
                a.rel = "noopener";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(52, 211, 153, 0.12)",
                color: "#A7F3D0",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Save geometry
            </button>
          </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setTransform((t) => ({ ...t, scale: Math.min(3, t.scale * 1.2) }));
          }}
          style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.5)", color: "white", cursor: "pointer" }}
        >
          +
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setTransform({ x: 0, y: 0, scale: 1 });
          }}
          style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.5)", color: "white", cursor: "pointer" }}
        >
          ⌂
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setTransform((t) => ({ ...t, scale: Math.max(0.3, t.scale * 0.8) }));
          }}
          style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.5)", color: "white", cursor: "pointer" }}
        >
          −
        </button>
      </div>
    </div>
  );
}

type TimelineViewProps = {
  areas: AreaData[];
  focused: string | null;
  onAreaClick: (area: AreaData) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
};

function TimelineView({ areas, focused, onAreaClick, onMomentClick }: TimelineViewProps) {
  const years = areas
    .flatMap((area) => area.threads.flatMap((thread) => thread.moments.map((moment) => moment.year).filter((y): y is number => typeof y === "number")))
    .sort((a, b) => a - b);
  const minYear = years[0] ?? new Date().getFullYear() - 5;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear() + 1;
  const span = Math.max(1, maxYear - minYear);

  return (
    <div style={{ overflowX: "auto", padding: "14px 12px 16px" }}>
      <div style={{ minWidth: Math.max(1200, span * 80 + 260) }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--color-background-primary)", paddingBottom: 8 }}>
          <div style={{ position: "relative", height: 28, marginLeft: 160 }}>
            {Array.from({ length: span + 1 }).map((_, idx) => {
              const year = minYear + idx;
              const x = (idx / span) * (Math.max(1200, span * 80 + 260) - 200);
              return (
                <span
                  key={year}
                  style={{
                    position: "absolute",
                    left: x,
                    fontSize: 10,
                    color: "var(--color-text-tertiary)",
                    transform: "translateX(-50%)",
                  }}
                >
                  {year}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {areas.map((area) => (
            <div
              key={area.id}
              style={{
                opacity: getOpacity(focused, area.id),
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 10,
                padding: "10px 10px 8px",
                background: "var(--color-background-primary)",
              }}
            >
              <button
                type="button"
                onClick={() => onAreaClick(area)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: area.color,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                {area.label}
              </button>
              <div style={{ position: "relative", height: 64, marginLeft: 150 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 32,
                    borderTop: "1px dashed var(--color-border-tertiary)",
                    opacity: 0.7,
                  }}
                />
                {area.threads.flatMap((thread) =>
                  thread.moments.map((moment) => {
                    const fallbackYear = minYear;
                    const year = typeof moment.year === "number" ? moment.year : fallbackYear;
                    const t = (year - minYear) / span;
                    const x = t * (Math.max(1200, span * 80 + 260) - 220);
                    return (
                      <span key={moment.id} style={{ position: "absolute", left: x, top: 26, transform: "translate(-50%, -50%)" }}>
                        <button
                          type="button"
                          onClick={() => onMomentClick(moment, area)}
                          title={`${moment.label}${moment.year ? ` (${moment.year})` : ""}`}
                          style={{
                            display: "block",
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: `2px solid ${area.color}`,
                            background: "var(--color-background-primary)",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        />
                      </span>
                    );
                  }),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ThreadViewProps = {
  areas: AreaData[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
  focused: string | null;
  onAreaClick: (area: AreaData) => void;
};

function ThreadView({ areas, selectedThreadId, onSelectThread, onMomentClick, focused, onAreaClick }: ThreadViewProps) {
  const allThreads = areas.flatMap((area) => area.threads.map((thread) => ({ area, thread })));
  const selected = allThreads.find((entry) => entry.thread.id === selectedThreadId) ?? allThreads[0] ?? null;
  const moments = [...(selected?.thread.moments ?? [])].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  return (
    <div style={{ padding: "14px 16px 18px", overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {allThreads.map(({ area, thread }) => {
          const active = selected?.thread.id === thread.id;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => {
                onSelectThread(thread.id);
                onAreaClick(area);
              }}
              style={{
                borderRadius: 999,
                border: `1px solid ${active ? area.color : "var(--color-border-secondary)"}`,
                background: active ? "var(--color-background-secondary)" : "transparent",
                color: active ? area.color : "var(--color-text-secondary)",
                padding: "6px 10px",
                fontSize: 11,
                cursor: "pointer",
                opacity: getOpacity(focused, area.id),
              }}
            >
              {thread.type}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 12 }}>
          <div style={{ color: selected.area.color, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            {selected.thread.type} · {selected.area.label}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {moments.map((moment) => (
                <button
                  key={moment.id}
                  type="button"
                  onClick={() => onMomentClick(moment, selected.area)}
                  style={{
                    textAlign: "left",
                    border: "1px solid var(--color-border-tertiary)",
                    borderRadius: 8,
                    padding: "10px 11px",
                    background: "var(--color-background-primary)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "var(--color-text-primary)", fontSize: 13, fontWeight: 600 }}>{moment.label}</span>
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>{moment.year ?? "Unknown"}</span>
                  </div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: 12, marginBottom: 6 }}>
                    {moment.description ?? "No description yet."}
                  </div>
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    significance {moment.significance} · status {statusFromMoment(moment)}
                    {moment.value !== null ? ` · value ${moment.value}` : ""}
                  </div>
                </button>
            ))}
          </div>
          {moments.length >= 3 ? (
            <div
              style={{
                marginTop: 12,
                borderTop: "1px solid var(--color-border-tertiary)",
                paddingTop: 10,
                color: "var(--color-text-secondary)",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              AI reflection: This thread shows a coherent arc from
              {" "}
              <strong>{moments[0]?.label ?? "early moments"}</strong>
              {" "}
              to
              {" "}
              <strong>{moments[moments.length - 1]?.label ?? "recent moments"}</strong>
              , with meaning accumulating through repeated choices and turning points.
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>No threads yet.</div>
      )}
    </div>
  );
}

function TreePanel({ panel, areas, onClose, onCreateBranchFromMoment }: TreePanelProps) {
  const [newBranchLabel, setNewBranchLabel] = useState("");
  const [branching, setBranching] = useState(false);
  const [branchCreateError, setBranchCreateError] = useState<string | null>(null);
  if (panel.type === "none") return null;

  if (panel.type === "foundations") {
    return (
      <section
        style={{
          borderTop: "1.5px solid #888780",
          background: "var(--color-background-primary)",
          padding: "14px 18px 20px",
          animation: "slideup 160ms ease-out",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            position: "absolute",
            right: 12,
            top: 8,
            border: "none",
            background: "transparent",
            fontSize: 18,
            lineHeight: 1,
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: ".14em", color: "var(--color-text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>
          Foundations
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65, marginBottom: 12 }}>
          The unchosen context — everything that shaped you before you had real agency. The richer this becomes, the more personally the AI reflects on everything growing above it.
        </p>
        <button
          style={{
            fontSize: 12,
            color: "var(--color-text-info)",
            background: "none",
            border: "0.5px solid var(--color-border-info)",
            borderRadius: "var(--border-radius-md)",
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Add to your foundations →
        </button>
      </section>
    );
  }

  if (panel.type === "area") {
    const area = panel.area;
    const moments = area.threads.flatMap((t) => t.moments);
    return (
      <section
        style={{
          borderTop: `1.5px solid ${area.color}`,
          background: "var(--color-background-primary)",
          padding: "14px 18px 20px",
          animation: "slideup 160ms ease-out",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            position: "absolute",
            right: 12,
            top: 8,
            border: "none",
            background: "transparent",
            fontSize: 18,
            lineHeight: 1,
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: area.color }}>{area.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {area.threads.length} threads · {moments.length} moments
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {area.threads.map((thread) => {
            const statuses = thread.moments.map(statusFromMoment);
            const hasEnded = statuses.includes("ended");
            const hasGrowing = statuses.includes("growing");
            const hasBloomed = statuses.includes("bloomed");
            const badge = hasGrowing ? "growing" : hasEnded && !hasBloomed ? "ended" : "bloomed";
            return (
              <div
                key={thread.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid var(--color-border-tertiary)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>{thread.type}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{thread.moments.length} moments</div>
                </div>
                <span
                  style={{
                    ...statusBadgeStyle(badge),
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    borderRadius: 999,
                    padding: "3px 8px",
                  }}
                >
                  {badge}
                </span>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          {area.summary ??
            "Summary coming soon. This area weaves together how your moments in this part of life connect over time."}
        </p>
      </section>
    );
  }

  const area = panel.area;
  const moment = panel.moment;
  const thread = areas
    .flatMap((a) => a.threads)
    .find((t) => t.id === moment.branchId);
  const status = statusFromMoment(moment);
  const defaultBranchLabel = newBranchLabel.trim();
  const canCreateBranch = defaultBranchLabel.length > 1 && !branching;

  return (
    <section
      style={{
        borderTop: `1.5px solid ${area.color}`,
        background: "var(--color-background-primary)",
        padding: "14px 18px 20px",
        animation: "slideup 160ms ease-out",
        position: "relative",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close panel"
        style={{
          position: "absolute",
          right: 12,
          top: 8,
          border: "none",
          background: "transparent",
          fontSize: 18,
          lineHeight: 1,
          color: "var(--color-text-tertiary)",
          cursor: "pointer",
        }}
      >
        ×
      </button>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: area.color, fontWeight: 600 }}>{area.label}</span>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>·</span>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{thread?.type ?? "Thread"}</span>
        {moment.year ? (
          <>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>·</span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{moment.year}</span>
          </>
        ) : null}
        <span
          style={{
            ...statusBadgeStyle(status),
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            borderRadius: 999,
            padding: "3px 8px",
          }}
        >
          {status}
        </span>
        {moment.value !== null ? (
          <span
            style={{
              background: "var(--color-background-secondary, rgba(148,163,184,0.15))",
              color: "var(--color-text-secondary, #334155)",
              fontSize: 10,
              borderRadius: 999,
              padding: "3px 8px",
            }}
          >
            value {moment.value}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>{moment.label}</div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65, marginBottom: 10 }}>
        {moment.description ?? "No description yet."}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: n <= moment.significance ? area.color : "var(--color-border-secondary)",
                opacity: n <= moment.significance ? 0.95 : 0.6,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", textTransform: "lowercase" }}>
          {sigLabel(moment.significance)}
        </span>
      </div>
      {!moment.synthetic ? (
      <div
        style={{
          marginTop: 12,
          borderTop: "1px solid var(--color-border-tertiary)",
          paddingTop: 10,
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: area.color }}>
          Branch this moment into a new thread
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={newBranchLabel}
            onChange={(e) => {
              setNewBranchLabel(e.target.value);
              if (branchCreateError) setBranchCreateError(null);
            }}
            placeholder="e.g. Weight loss"
            style={{
              minWidth: 220,
              flex: "1 1 240px",
              padding: "7px 9px",
              borderRadius: 8,
              border: "1px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
            }}
          />
          <button
            type="button"
            disabled={!canCreateBranch}
            onClick={async () => {
              const label = newBranchLabel.trim();
              if (label.length < 2) return;
              setBranching(true);
              setBranchCreateError(null);
              const result = await onCreateBranchFromMoment({
                limbId: area.id,
                parentBranchId: moment.branchId,
                turningPointId: moment.id,
                label,
              });
              setBranching(false);
              if (!result.ok) {
                setBranchCreateError(result.error ?? "Could not create branch.");
                return;
              }
              setNewBranchLabel("");
            }}
            style={{
              padding: "7px 11px",
              borderRadius: 8,
              border: "1px solid var(--color-border-info)",
              background: canCreateBranch ? "var(--color-background-info, rgba(59,130,246,0.14))" : "var(--color-background-secondary)",
              color: canCreateBranch ? "var(--color-text-info, #1D4ED8)" : "var(--color-text-tertiary)",
              cursor: canCreateBranch ? "pointer" : "not-allowed",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {branching ? "Creating..." : "Create child thread"}
          </button>
        </div>
        {branchCreateError ? (
          <div style={{ fontSize: 11, color: "var(--color-text-danger, #B91C1C)" }}>{branchCreateError}</div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            This creates a new branch with this moment as the fork point.
          </div>
        )}
      </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--color-border-tertiary)",
            paddingTop: 10,
            fontSize: 11,
            color: "var(--color-text-tertiary)",
          }}
        >
          Placeholder moment (tree density preview only). Branching is disabled.
        </div>
      )}
    </section>
  );
}
