import { LIFE_AREAS } from "@/lib/life-areas";
import type { LimbId } from "@/lib/types";

/** North-star life-area colors (roadmap shell). */
export const ROADMAP_LIFE_AREA_HEX: Record<LimbId, string> = {
  finance: "#3D7A5E",
  work: "#5B6FD4",
  becoming: "#A0622F",
  people: "#C25E8A",
  health: "#4A8FA8",
  pleasures: "#2F8FB8",
};

const ROADMAP_LIFE_AREA_HEX_DARK: Record<LimbId, string> = {
  finance: "#4D9A74",
  work: "#7B8FE8",
  becoming: "#C4894F",
  people: "#D47BA6",
  health: "#6AAFCA",
  pleasures: "#47B8E8",
};

const ROADMAP_LIFE_AREA_SUB: Record<LimbId, string> = {
  finance: "#EBF4EF",
  work: "#EDEFFE",
  becoming: "#F7EDDF",
  people: "#F9EAF2",
  health: "#E5F4F8",
  pleasures: "#E8F6FD",
};

const ROADMAP_LIFE_AREA_SUB_DARK: Record<LimbId, string> = {
  finance: "#1A2E25",
  work: "#1E2240",
  becoming: "#2E2018",
  people: "#2E1824",
  health: "#1A2E35",
  pleasures: "#152830",
};

const KNOWN_LIFE_AREA_IDS = new Set(LIFE_AREAS.map((l) => l.id));

export function coerceRoadmapLifeAreaId(raw: string): LimbId {
  return KNOWN_LIFE_AREA_IDS.has(raw as LimbId) ? (raw as LimbId) : "work";
}

/** Column order left-to-right (aligned with tree `LIFE_AREA_ORDER`). */
export const ROADMAP_LIFE_AREA_COLUMN_ORDER: LimbId[] = [
  "finance",
  "work",
  "becoming",
  "people",
  "health",
  "pleasures",
];

export type RoadmapMarkInput = {
  id: string;
  branchId: string;
  limbId: string;
  title: string;
  description: string | null;
  date: string;
  type: string;
  archived?: boolean;
  forkType?: "fork_open" | "fork_resolved" | null;
  resolvesForkId?: string | null;
  previousMarkId?: string | null;
  nextMarkId?: string | null;
};

export type RoadmapBranchInput = {
  id: string;
  limbId: string;
  name?: string | null;
  label?: string | null;
  goal?: string | null;
  goalValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  parentBranchId?: string | null;
  turningPointId?: string | null;
  order?: number;
  createdAt: string;
};

export type RoadmapVizType =
  | "decision"
  | "milestone"
  | "realisation"
  | "setback"
  | "goal"
  | "achievement";

export type RoadmapNode = {
  id: string;
  /** Synthetic limb roots use null; other nodes point to tree parent. */
  parentId: string | null;
  tree: LimbId;
  x: number;
  y: number;
  past: boolean;
  type: RoadmapVizType;
  label: string;
  date: string;
  note: string;
};

export type RoadmapEdge = readonly [string, string];
export type RoadmapParentAnchor = {
  anchorMark: RoadmapMarkInput | null;
  nextParentMarkId?: string;
  t?: number;
};

/** Synthetic id prefix for one root decision node per visible life area (string kept for stable node ids). */
export const ROADMAP_LIFE_AREA_ROOT_PREFIX = "limb-root:" as const;
export function roadmapLifeAreaRootId(lifeAreaId: LimbId): string {
  return `${ROADMAP_LIFE_AREA_ROOT_PREFIX}${lifeAreaId}`;
}
const ROADMAP_LIFE_AREA_ROOT_DECISION_LABEL: Record<LimbId, string> = {
  becoming: "Start of Who I'm Becoming Journey",
  work: "Start of Work & Learning Journey",
  finance: "Start of Money & Finance Journey",
  health: "Start of Health & Body Journey",
  people: "Start of People & Relationships Journey",
  pleasures: "Start of Pleasures Journey",
};

/**
 * Whether an edge should use fork flare control points:
 * flare on a fork node, but suppress if parent itself sits under another fork.
 */
export function roadmapEdgeUsesForkFlare(
  edgeParentId: string,
  childCountByParent: Record<string, number>,
  parentIdOf: (nodeId: string) => string | null | undefined,
): boolean {
  if ((childCountByParent[edgeParentId] ?? 0) < 2) return false;
  const upstream = parentIdOf(edgeParentId);
  if (
    upstream != null &&
    upstream !== "" &&
    (childCountByParent[upstream] ?? 0) >= 2
  ) {
    return false;
  }
  return true;
}

export type RoadmapLayoutOptions = {
  /** Past timeline starts at Jan 1 of this year when valid; otherwise earliest mark per branch. */
  birthYear: number | null;
  /**
   * Life areas to lay out left-to-right (subset of `ROADMAP_LIFE_AREA_COLUMN_ORDER`).
   * Omitted or empty = all. Hidden life areas are omitted so remaining columns widen.
   */
  visibleLifeAreaIds?: LimbId[];
  /**
   * When set (e.g. viewport width), total canvas width is at least this value so
   * fewer visible life-area columns expand to fill horizontal space.
   */
  minLayoutWidth?: number;
};

export const ROADMAP_NOW_Y = 430;
/** Taller canvas so the past band can space nodes more comfortably. */
export const ROADMAP_SVG_H = 3160;
/** Legacy baseline width; actual canvas width is `layoutWidth` from `buildRoadmapLayout`. */
export const ROADMAP_REF_WIDTH = 980;

const ROADMAP_BASE_COL_W = ROADMAP_REF_WIDTH / ROADMAP_LIFE_AREA_COLUMN_ORDER.length;
/** Max width of one life-area column before capping (px). */
const ROADMAP_MAX_COL_W = 720;
/** Each life-area column gets at least this horizontal room. */
const ROADMAP_MIN_TREE_WIDTH = 300;
/** Side breathing room so outer lanes/labels don't clip at overview zoom. */
const ROADMAP_SIDE_PADDING = 160;
/** Fixed horizontal distance between branch lanes (px). */
const ROADMAP_BRANCH_LANE_WIDTH = 220;
/** Preferred vertical gap between nodes after packing (px). */
const ROADMAP_PREFERRED_NODE_GAP = 78;
/** Minimum vertical gap when the past band is very dense (px). */
const ROADMAP_MIN_NODE_GAP = 28;
/** Minimum parent→child y separation. */
export const ROADMAP_MIN_PARENT_CHILD_Y_GAP = 40;
/** Root→first-child preferred separation. */
export const ROADMAP_MIN_LIFE_AREA_ROOT_CHILD_Y_GAP = 140;
/** Root→first-child maximum separation. */
export const ROADMAP_MAX_LIFE_AREA_ROOT_CHILD_Y_GAP = 140;
/** Default node radius and enlarged root radius. */
export const ROADMAP_NODE_R = 10.5;
export const ROADMAP_LIFE_AREA_ROOT_NODE_R = ROADMAP_NODE_R * 1.75;
/** Empty space below the life-area root node so bottom labels don't crowd. */
const ROADMAP_LIFE_AREA_ROOT_BOTTOM_CLEAR_PX = 320;

export function goalSyntheticId(branchId: string): string {
  return `goal:${branchId}`;
}

export function roadmapTreeMeta(): Record<
  LimbId,
  { color: string; sub: string; label: string; darkColor: string; darkSub: string }
> {
  const out = {} as Record<
    LimbId,
    { color: string; sub: string; label: string; darkColor: string; darkSub: string }
  >;
  for (const l of LIFE_AREAS) {
    const id = l.id as LimbId;
    out[id] = {
      color: ROADMAP_LIFE_AREA_HEX[id],
      sub: ROADMAP_LIFE_AREA_SUB[id],
      label: l.label,
      darkColor: ROADMAP_LIFE_AREA_HEX_DARK[id],
      darkSub: ROADMAP_LIFE_AREA_SUB_DARK[id],
    };
  }
  return out;
}

export function getRoadmapLifeAreaColor(lifeAreaId: LimbId, isDark: boolean): string {
  return isDark ? ROADMAP_LIFE_AREA_HEX_DARK[lifeAreaId] : ROADMAP_LIFE_AREA_HEX[lifeAreaId];
}

export function getRoadmapLifeAreaSub(lifeAreaId: LimbId, isDark: boolean): string {
  return isDark ? ROADMAP_LIFE_AREA_SUB_DARK[lifeAreaId] : ROADMAP_LIFE_AREA_SUB[lifeAreaId];
}

function branchDisplayName(b: RoadmapBranchInput): string {
  const raw = (b.name ?? b.label ?? "").trim();
  return raw || "Branch";
}

/** One horizontal track inside a limb column (for sub-labels under the limb title). */
export type RoadmapBranchLane = {
  branchId: string;
  limbId: LimbId;
  x: number;
  label: string;
  /** Branch split from a parent (fork); styled slightly quieter. */
  isChild: boolean;
  /** Hide redundant caption when this limb has only one track. */
  showLabel: boolean;
};

/**
 * One narrative spine per limb: root branches ordered by time, with the **primary**
 * root (most marks, then longest span) centered; child branches follow to the side.
 */
function orderBranchesForLifeAreaLayout(
  limbId: LimbId,
  ids: string[],
  byBranch: Map<string, RoadmapMarkInput[]>,
  branchRow: (id: string) => RoadmapBranchInput | undefined,
): RoadmapBranchInput[] {
  const rows: RoadmapBranchInput[] = ids.map((id) => {
    const row = branchRow(id);
    if (row) return row;
    return {
      id,
      limbId,
      createdAt: "",
      parentBranchId: null,
      turningPointId: null,
    } as RoadmapBranchInput;
  });

  const isRoot = (b: RoadmapBranchInput) => !b.parentBranchId;
  const roots = rows.filter(isRoot);
  const children = rows.filter((b) => !isRoot(b));

  const byFirstMark = (a: RoadmapBranchInput, b: RoadmapBranchInput) => {
    const ma = byBranch.get(a.id)?.[0];
    const mb = byBranch.get(b.id)?.[0];
    const ta = ma ? new Date(ma.date).getTime() : 0;
    const tb = mb ? new Date(mb.date).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  };

  roots.sort(byFirstMark);
  children.sort(byFirstMark);

  const markCount = (bid: string) => byBranch.get(bid)?.length ?? 0;
  const spanMs = (b: RoadmapBranchInput) => {
    const ms = byBranch.get(b.id);
    if (!ms || ms.length < 2) return 0;
    return new Date(ms[ms.length - 1].date).getTime() - new Date(ms[0].date).getTime();
  };
  const childrenCountByBranch = new Map<string, number>();
  for (const row of rows) {
    const pid = row.parentBranchId;
    if (!pid) continue;
    childrenCountByBranch.set(pid, (childrenCountByBranch.get(pid) ?? 0) + 1);
  }
  const continuityScore = (b: RoadmapBranchInput) => {
    const ms = byBranch.get(b.id) ?? [];
    if (ms.length < 3) return 0;
    let totalGap = 0;
    for (let i = 1; i < ms.length; i++) {
      totalGap += Math.max(0, new Date(ms[i].date).getTime() - new Date(ms[i - 1].date).getTime());
    }
    // Smaller average gap => stronger ongoing narrative thread.
    const avgGap = totalGap / Math.max(1, ms.length - 1);
    return avgGap <= 0 ? 0 : 1 / avgGap;
  };
  const branchRichnessScore = (b: RoadmapBranchInput) =>
    markCount(b.id) * 1_000_000_000 +
    spanMs(b) * 0.01 +
    (childrenCountByBranch.get(b.id) ?? 0) * 50_000_000 +
    continuityScore(b) * 1_000_000_000_000;

  function centerByPriority(arr: RoadmapBranchInput[]): RoadmapBranchInput[] {
    if (arr.length <= 1) return [...arr];
    const ranked = [...arr].sort((a, b) => {
      const ds = branchRichnessScore(b) - branchRichnessScore(a);
      if (Math.abs(ds) > 0.001) return ds;
      return byFirstMark(a, b);
    });
    const out = new Array<RoadmapBranchInput>(arr.length);
    const centerLeft = Math.floor((arr.length - 1) / 2);
    const centerRight = Math.ceil((arr.length - 1) / 2);
    const slots: number[] = [centerLeft];
    if (centerRight !== centerLeft) slots.push(centerRight);
    for (let d = 1; slots.length < arr.length; d++) {
      const l = centerLeft - d;
      const r = centerRight + d;
      if (l >= 0) slots.push(l);
      if (r < arr.length) slots.push(r);
    }
    ranked.forEach((branch, i) => {
      out[slots[i]!] = branch;
    });
    return out;
  }

  const orderedRoots = roots.length === 0 ? [] : centerByPriority(roots);
  return [...orderedRoots, ...children];
}

function formatMarkDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(d);
}

function goalDateLine(b: RoadmapBranchInput): string {
  if (b.goalValue != null && Number.isFinite(b.goalValue)) {
    const u = (b.unit ?? "").trim();
    return u ? `${b.goalValue} ${u}` : String(b.goalValue);
  }
  return "Ahead";
}

function normalizeMarkType(t: string): RoadmapVizType {
  if (
    t === "decision" ||
    t === "milestone" ||
    t === "realisation" ||
    t === "setback" ||
    t === "achievement" ||
    t === "goal"
  ) {
    return t;
  }
  return "milestone";
}

function marksByBranchSorted(marks: RoadmapMarkInput[]): Map<string, RoadmapMarkInput[]> {
  const map = new Map<string, RoadmapMarkInput[]>();
  for (const m of marks) {
    if (m.archived) continue;
    const arr = map.get(m.branchId) ?? [];
    arr.push(m);
    map.set(m.branchId, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  }
  return map;
}

export function buildPrimarySpineByLifeArea(
  branches: RoadmapBranchInput[],
  marks: RoadmapMarkInput[],
): Map<LimbId, string> {
  const byBranch = marksByBranchSorted(marks.filter((m) => !m.archived));
  const branchById = new Map(branches.map((b) => [b.id, b] as const));
  const childrenCountByBranch = new Map<string, number>();
  for (const b of branches) {
    if (!b.parentBranchId) continue;
    childrenCountByBranch.set(b.parentBranchId, (childrenCountByBranch.get(b.parentBranchId) ?? 0) + 1);
  }
  const scoreBranch = (branchId: string): number => {
    const series = byBranch.get(branchId) ?? [];
    const count = series.length;
    const span =
      series.length < 2
        ? 0
        : new Date(series[series.length - 1]!.date).getTime() - new Date(series[0]!.date).getTime();
    const children = childrenCountByBranch.get(branchId) ?? 0;
    return count * 1_000_000_000 + span * 0.01 + children * 50_000_000;
  };
  const tieBreak = (a: string, b: string): number => {
    const ma = byBranch.get(a)?.[0];
    const mb = byBranch.get(b)?.[0];
    const ta = ma ? new Date(ma.date).getTime() : 0;
    const tb = mb ? new Date(mb.date).getTime() : 0;
    if (ta !== tb) return ta - tb;
    const ca = branchById.get(a)?.createdAt ?? "";
    const cb = branchById.get(b)?.createdAt ?? "";
    return ca.localeCompare(cb);
  };
  const out = new Map<LimbId, string>();
  for (const limbId of ROADMAP_LIFE_AREA_COLUMN_ORDER) {
    const limbBranchIds = new Set<string>();
    for (const m of marks) {
      if (m.archived) continue;
      if (coerceRoadmapLifeAreaId(m.limbId) === limbId) limbBranchIds.add(m.branchId);
    }
    for (const b of branches) {
      if (coerceRoadmapLifeAreaId(b.limbId) === limbId) limbBranchIds.add(b.id);
    }
    const candidates = [...limbBranchIds];
    if (candidates.length === 0) continue;
    const roots = candidates.filter((id) => {
      const pid = branchById.get(id)?.parentBranchId;
      if (!pid) return true;
      const parent = branchById.get(pid);
      return !parent || coerceRoadmapLifeAreaId(parent.limbId) !== limbId;
    });
    const pool = roots.length > 0 ? roots : candidates;
    pool.sort((a, b) => {
      const ds = scoreBranch(b) - scoreBranch(a);
      if (Math.abs(ds) > 0.001) return ds;
      return tieBreak(a, b);
    });
    out.set(limbId, pool[0]!);
  }
  return out;
}

export function resolveChronologyParentBranchId(
  branch: RoadmapBranchInput,
  spineByLifeArea: Map<LimbId, string>,
): string | null {
  if (!branch.parentBranchId) return null;
  const limbId = coerceRoadmapLifeAreaId(branch.limbId);
  const spineId = spineByLifeArea.get(limbId);
  if (!spineId || branch.id === spineId) return branch.parentBranchId;
  return spineId;
}

export function resolveParentBranchAnchor(
  parentMarks: RoadmapMarkInput[],
  turningPointId: string | null | undefined,
  childStartDate: string | null | undefined,
): RoadmapParentAnchor {
  if (turningPointId) {
    const hit = parentMarks.find((m) => m.id === turningPointId) ?? null;
    if (hit) return { anchorMark: hit };
  }
  if (childStartDate && parentMarks.length > 0) {
    const childTs = new Date(childStartDate).getTime();
    if (Number.isFinite(childTs)) {
      let candidate: RoadmapMarkInput | null = null;
      let candidateIdx = -1;
      for (let i = 0; i < parentMarks.length; i += 1) {
        const pm = parentMarks[i]!;
        const ts = new Date(pm.date).getTime();
        if (!Number.isFinite(ts)) continue;
        if (ts <= childTs) {
          candidate = pm;
          candidateIdx = i;
        } else {
          break;
        }
      }
      if (candidate) {
        const next = parentMarks[candidateIdx + 1];
        if (next) {
          const at = new Date(candidate.date).getTime();
          const bt = new Date(next.date).getTime();
          if (Number.isFinite(at) && Number.isFinite(bt) && bt > at && childTs >= at && childTs <= bt) {
            const t = Math.max(0, Math.min(1, (childTs - at) / (bt - at)));
            return { anchorMark: candidate, nextParentMarkId: next.id, t };
          }
        }
        return { anchorMark: candidate };
      }
      return { anchorMark: parentMarks[0] ?? null };
    }
  }
  return { anchorMark: parentMarks[parentMarks.length - 1] ?? null };
}

function timelineStartMs(birthYear: number | null | undefined): number | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;
  const y = Math.trunc(birthYear);
  if (y < 1900 || y > 2100) return null;
  return new Date(y, 0, 1).getTime();
}

function rootBirthDateLine(birthYear: number | null | undefined): string {
  if (birthYear == null || !Number.isFinite(birthYear)) return "Born year unknown";
  const y = Math.trunc(birthYear);
  if (y < 1900 || y > 2100) return "Born year unknown";
  return `Born ${y}`;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
function temporalBucketScore(anchorMs: number, timestampMs: number): number {
  const years = Math.max(0, (timestampMs - anchorMs) / MS_PER_YEAR);
  if (years <= 1) return years * 1.5;
  if (years <= 3) return 1.5 + (years - 1) * 2.8;
  if (years <= 10) return 1.5 + 2 * 2.8 + (years - 3) * 4.1;
  return 1.5 + 2 * 2.8 + 7 * 4.1 + (years - 10) * 5.8;
}

/** Pack sorted-by-Y items with minimum gaps; fit into [yLo, yHi]. */
function packYMonotonic(
  items: { id: string; ideal: number }[],
  yLo: number,
  yHi: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  const avail = Math.max(1, yHi - yLo);
  const n = items.length;
  const gap = Math.max(
    ROADMAP_MIN_NODE_GAP,
    Math.min(ROADMAP_PREFERRED_NODE_GAP, Math.floor(avail / Math.max(n - 1, 1))),
  );
  const sorted = [...items].sort((a, b) => a.ideal - b.ideal);
  const packed: number[] = new Array(sorted.length);
  packed[0] = sorted[0].ideal;
  for (let k = 1; k < sorted.length; k++) {
    packed[k] = Math.max(sorted[k].ideal, packed[k - 1] + gap);
  }
  const span = packed[packed.length - 1] - packed[0];
  if (span > avail) {
    const scale = avail / span;
    for (let k = 0; k < packed.length; k++) {
      packed[k] = yLo + (packed[k] - packed[0]) * scale;
    }
  } else {
    const mid = (packed[0] + packed[packed.length - 1]) / 2;
    const target = (yLo + yHi) / 2;
    const shift = target - mid;
    for (let k = 0; k < packed.length; k++) packed[k] += shift;
    if (packed[0] < yLo) {
      const d = yLo - packed[0];
      for (let k = 0; k < packed.length; k++) packed[k] += d;
    }
    if (packed[packed.length - 1] > yHi) {
      const d = yHi - packed[packed.length - 1];
      for (let k = 0; k < packed.length; k++) packed[k] += d;
    }
  }
  sorted.forEach((it, k) => out.set(it.id, packed[k]));
  return out;
}

function shiftSubtreeY(
  startId: string,
  delta: number,
  childrenByParent: Map<string, string[]>,
  nodeById: Map<string, RoadmapNode>,
) {
  if (delta === 0) return;
  const n = nodeById.get(startId);
  if (n) n.y += delta;
  for (const cid of childrenByParent.get(startId) ?? []) {
    shiftSubtreeY(cid, delta, childrenByParent, nodeById);
  }
}

function parseRoadmapNodeTimeMs(node: RoadmapNode): number | null {
  const bornMatch = /^Born\s+(\d{4})$/i.exec(node.date.trim());
  if (bornMatch) {
    const y = Number(bornMatch[1]);
    if (Number.isFinite(y)) return new Date(y, 0, 1).getTime();
  }
  const t = Date.parse(node.date);
  return Number.isFinite(t) ? t : null;
}

function rootDynamicMaxGapPx(
  rootNode: RoadmapNode,
  childNode: RoadmapNode,
  fallbackMaxGap: number,
): number {
  const t0 = parseRoadmapNodeTimeMs(rootNode);
  const t1 = parseRoadmapNodeTimeMs(childNode);
  if (t0 == null || t1 == null || t1 <= t0) return fallbackMaxGap;
  const years = (t1 - t0) / (365.25 * 24 * 60 * 60 * 1000);
  // Allow visibly larger origin gaps for long pre-history spans.
  const scaled = fallbackMaxGap + years * 3.8;
  return Math.max(fallbackMaxGap, Math.min(760, scaled));
}

function enforceTreeParentChildY(
  nodeById: Map<string, RoadmapNode>,
  minGap: number,
  lifeAreaRootMinGap: number,
  lifeAreaRootMaxGap: number,
) {
  const childrenByParent = new Map<string, string[]>();
  for (const n of nodeById.values()) {
    if (!n.parentId) continue;
    const arr = childrenByParent.get(n.parentId) ?? [];
    arr.push(n.id);
    childrenByParent.set(n.parentId, arr);
  }
  for (const arr of childrenByParent.values()) arr.sort();
  const roots = [...nodeById.values()].filter((n) => !n.parentId).map((n) => n.id).sort();

  for (let pass = 0; pass < 48; pass++) {
    let changed = false;
    const queue = [...roots];
    for (let qi = 0; qi < queue.length; qi++) {
      const pid = queue[qi]!;
      const p = nodeById.get(pid);
      if (!p) continue;
      const isRoot = p.id.startsWith(ROADMAP_LIFE_AREA_ROOT_PREFIX);
      const gap = isRoot ? lifeAreaRootMinGap : minGap;
      for (const cid of childrenByParent.get(pid) ?? []) {
        const c = nodeById.get(cid);
        if (!c) continue;
        const maxChildY = p.y - gap;
        if (c.y > maxChildY) {
          shiftSubtreeY(cid, maxChildY - c.y, childrenByParent, nodeById);
          changed = true;
        }
        if (isRoot) {
          const dynamicMaxGap = rootDynamicMaxGapPx(p, c, lifeAreaRootMaxGap);
          const minChildY = p.y - dynamicMaxGap;
          if (c.y < minChildY) {
            shiftSubtreeY(cid, minChildY - c.y, childrenByParent, nodeById);
            changed = true;
          }
        }
        queue.push(cid);
      }
    }
    if (!changed) break;
  }
}

export type RoadmapLayoutResult = {
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  byBranch: Map<string, RoadmapMarkInput[]>;
  /** Total SVG width (sum of limb columns); grows when many branches need horizontal room. */
  layoutWidth: number;
  /** Branch track positions + captions (only `showLabel` when limb has multiple tracks). */
  branchLanes: RoadmapBranchLane[];
};

/**
 * Past marks + optional branch goal nodes, edge list, and laid-out x/y matching the reference timeline.
 */
function resolveVisibleLifeAreas(visibleLifeAreaIds?: LimbId[]): LimbId[] {
  const requested = (visibleLifeAreaIds ?? []).filter((id) =>
    ROADMAP_LIFE_AREA_COLUMN_ORDER.includes(id),
  );
  const ordered =
    requested.length > 0
      ? ROADMAP_LIFE_AREA_COLUMN_ORDER.filter((id) => requested.includes(id))
      : [...ROADMAP_LIFE_AREA_COLUMN_ORDER];
  return ordered.length > 0 ? ordered : [...ROADMAP_LIFE_AREA_COLUMN_ORDER];
}

export function buildRoadmapLayout(
  marks: RoadmapMarkInput[],
  branches: RoadmapBranchInput[],
  options?: RoadmapLayoutOptions,
): RoadmapLayoutResult {
  const lifeAreas = resolveVisibleLifeAreas(options?.visibleLifeAreaIds);
  const lifeAreaCount = lifeAreas.length;

  const birthAnchor = timelineStartMs(options?.birthYear ?? null);
  const activeMarks = marks.filter((m) => !m.archived);
  const byBranch = marksByBranchSorted(activeMarks);
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const spineByLifeArea = buildPrimarySpineByLifeArea(branches, activeMarks);
  const activeMarksByLimb = new Map<LimbId, RoadmapMarkInput[]>();
  lifeAreas.forEach((id) => activeMarksByLimb.set(id, []));
  for (const m of activeMarks) {
    const lid = coerceRoadmapLifeAreaId(m.limbId);
    if (!activeMarksByLimb.has(lid)) continue;
    activeMarksByLimb.get(lid)!.push(m);
  }
  for (const arr of activeMarksByLimb.values()) {
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  const limbPastScoreByMarkId = new Map<string, number>();
  const limbPastScoreMax = new Map<LimbId, number>();
  const limbPastCount = new Map<LimbId, number>();
  for (const limbId of lifeAreas) {
    const arr = activeMarksByLimb.get(limbId) ?? [];
    limbPastCount.set(limbId, arr.length);
    if (arr.length === 0) {
      limbPastScoreMax.set(limbId, 0);
      continue;
    }
    const limbAnchor = birthAnchor ?? new Date(arr[0]!.date).getTime();
    let maxScore = 0;
    for (const m of arr) {
      const score = temporalBucketScore(limbAnchor, new Date(m.date).getTime());
      limbPastScoreByMarkId.set(m.id, score);
      if (score > maxScore) maxScore = score;
    }
    limbPastScoreMax.set(limbId, maxScore);
  }

  const nodes: RoadmapNode[] = [];
  const goalIds = new Set<string>();

  for (const m of activeMarks) {
    const limb = coerceRoadmapLifeAreaId(m.limbId);
    nodes.push({
      id: m.id,
      parentId: null,
      tree: limb,
      x: 0,
      y: 0,
      past: true,
      type: normalizeMarkType(m.type),
      label: m.title,
      date: formatMarkDate(m.date),
      note: (m.description ?? "").trim(),
    });
  }

  for (const b of branches) {
    const g = (b.goal ?? "").trim();
    if (!g) continue;
    const limb = coerceRoadmapLifeAreaId(b.limbId);
    const gid = goalSyntheticId(b.id);
    goalIds.add(gid);
    nodes.push({
      id: gid,
      parentId: null,
      tree: limb,
      x: 0,
      y: 0,
      past: false,
      type: "goal",
      label: g,
      date: goalDateLine(b),
      note: branchDisplayName(b),
    });
  }
  for (const limbId of lifeAreas) {
    nodes.push({
      id: roadmapLifeAreaRootId(limbId),
      parentId: null,
      tree: limbId,
      x: 0,
      y: ROADMAP_SVG_H - ROADMAP_LIFE_AREA_ROOT_BOTTOM_CLEAR_PX,
      past: true,
      type: "decision",
      label: ROADMAP_LIFE_AREA_ROOT_DECISION_LABEL[limbId],
      date: rootBirthDateLine(options?.birthYear ?? null),
      note: "",
    });
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const anchorFromParentBranch = (
    parentBranchId: string,
    turningPointId: string | null | undefined,
    childStartDate: string | null | undefined,
  ): RoadmapMarkInput | null => {
    const parentMarks = byBranch.get(parentBranchId) ?? [];
    return resolveParentBranchAnchor(parentMarks, turningPointId, childStartDate).anchorMark;
  };

  for (const [branchId, list] of byBranch) {
    const br = branchById.get(branchId);
    if (!br) continue;
    const gid = goalSyntheticId(branchId);
    const rid = roadmapLifeAreaRootId(coerceRoadmapLifeAreaId(br.limbId));
    if (list.length > 0) {
      if (!br.parentBranchId) nodeById.get(list[0]!.id)!.parentId = rid;
      else {
        const chronologyParentBranchId = resolveChronologyParentBranchId(br, spineByLifeArea);
        const anchor = chronologyParentBranchId
          ? anchorFromParentBranch(chronologyParentBranchId, br.turningPointId, list[0]?.date)
          : null;
        nodeById.get(list[0]!.id)!.parentId = anchor?.id ?? rid;
      }
      for (let i = 1; i < list.length; i++) {
        nodeById.get(list[i]!.id)!.parentId = list[i - 1]!.id;
      }
      if (goalIds.has(gid)) nodeById.get(gid)!.parentId = list[list.length - 1]!.id;
    }
  }
  for (const b of branches) {
    const gid = goalSyntheticId(b.id);
    if (!goalIds.has(gid)) continue;
    if ((byBranch.get(b.id) ?? []).length > 0) continue;
    const rid = roadmapLifeAreaRootId(coerceRoadmapLifeAreaId(b.limbId));
    const g = nodeById.get(gid)!;
    if (!b.parentBranchId) g.parentId = rid;
    else {
      const chronologyParentBranchId = resolveChronologyParentBranchId(b, spineByLifeArea);
      const anchor = chronologyParentBranchId
        ? anchorFromParentBranch(chronologyParentBranchId, b.turningPointId, null)
        : null;
      g.parentId = anchor?.id ?? rid;
    }
  }

  const branchRow = (id: string) => branchById.get(id);

  function branchIdsWithContentForLifeArea(limbId: LimbId): string[] {
    const ids = new Set<string>();
    for (const m of activeMarks) {
      if (coerceRoadmapLifeAreaId(m.limbId) === limbId) ids.add(m.branchId);
    }
    for (const b of branches) {
      if (coerceRoadmapLifeAreaId(b.limbId) !== limbId) continue;
      if (goalIds.has(goalSyntheticId(b.id))) ids.add(b.id);
    }
    return Array.from(ids).sort((a, b) => {
      const ma = byBranch.get(a)?.[0];
      const mb = byBranch.get(b)?.[0];
      const ta = ma ? new Date(ma.date).getTime() : 0;
      const tb = mb ? new Date(mb.date).getTime() : 0;
      if (ta !== tb) return ta - tb;
      const ca = branchRow(a)?.createdAt ?? "";
      const cb = branchRow(b)?.createdAt ?? "";
      return ca.localeCompare(cb);
    });
  }

  let maxBranchesInLifeArea = 1;
  for (const limbId of lifeAreas) {
    maxBranchesInLifeArea = Math.max(maxBranchesInLifeArea, branchIdsWithContentForLifeArea(limbId).length);
  }

  /** Fewer visible life areas → each column at least this wide so the canvas fills the roadmap. */
  const minColForLifeAreaCount = ROADMAP_REF_WIDTH / lifeAreaCount;

  let colInner = Math.max(
    minColForLifeAreaCount,
    ROADMAP_MIN_TREE_WIDTH,
    Math.min(
      ROADMAP_MAX_COL_W,
      Math.max(ROADMAP_BASE_COL_W, (maxBranchesInLifeArea - 1) * ROADMAP_BRANCH_LANE_WIDTH + 96),
    ),
  );
  let layoutWidth = lifeAreaCount * colInner + ROADMAP_SIDE_PADDING * 2;
  const minCanvasW = options?.minLayoutWidth;
  if (minCanvasW != null && minCanvasW > 0 && minCanvasW > layoutWidth) {
    layoutWidth = minCanvasW;
    colInner = (layoutWidth - ROADMAP_SIDE_PADDING * 2) / lifeAreaCount;
  }

  const Y_PAST_TOP = ROADMAP_NOW_Y + 48;
  const Y_PAST_BOTTOM = ROADMAP_SVG_H - 56;
  const Y_FUTURE_TOP = 72;
  const Y_FUTURE_BOTTOM = ROADMAP_NOW_Y - 52;
  const PAST_PAD = 10;
  const FUTURE_PAD = 6;

  type PastIdeal = { id: string; ideal: number; limb: LimbId };
  type FutureIdeal = { id: string; ideal: number; limb: LimbId };
  const pastIdeals: PastIdeal[] = [];
  const branchLanes: RoadmapBranchLane[] = [];
  const futureByLimb = new Map<LimbId, FutureIdeal[]>();
  for (const id of lifeAreas) {
    futureByLimb.set(id, []);
  }

  for (let colIndex = 0; colIndex < lifeAreas.length; colIndex++) {
    const limbId = lifeAreas[colIndex];
    const limbBase = ROADMAP_SIDE_PADDING + colIndex * colInner;
    const colCenter = limbBase + colInner / 2;
    const rid = roadmapLifeAreaRootId(limbId);
    const root = nodeById.get(rid);
    if (root) {
      root.x = colCenter;
      root.y = ROADMAP_SVG_H - 58;
    }

    const branchesWithContentIds = branchIdsWithContentForLifeArea(limbId);
    const branchesWithContent = orderBranchesForLifeAreaLayout(
      limbId,
      branchesWithContentIds,
      byBranch,
      branchRow,
    );
    const branchIdsInLimb = new Set(branchesWithContent.map((b) => b.id));
    const childrenByBranch = new Map<string, RoadmapBranchInput[]>();
    const roots = branchesWithContent.filter((br) => {
      const pid = branchById.get(br.id)?.parentBranchId;
      return !pid || !branchIdsInLimb.has(pid);
    });
    for (const br of branchesWithContent) {
      const pid = branchById.get(br.id)?.parentBranchId;
      if (!pid || !branchIdsInLimb.has(pid)) continue;
      const arr = childrenByBranch.get(pid) ?? [];
      arr.push(br);
      childrenByBranch.set(pid, arr);
    }
    for (const arr of childrenByBranch.values()) {
      arr.sort((a, b) => (branchRow(a.id)?.createdAt ?? "").localeCompare(branchRow(b.id)?.createdAt ?? ""));
    }
    const laneByBranch = new Map<string, number>();
    const assign = (br: RoadmapBranchInput, lane: number) => {
      laneByBranch.set(br.id, lane);
      const kids = childrenByBranch.get(br.id) ?? [];
      if (kids.length === 2) {
        assign(kids[0]!, lane - 0.8);
        assign(kids[1]!, lane + 0.8);
      } else if (kids.length === 1) {
        assign(kids[0]!, lane);
      } else {
        for (let i = 0; i < kids.length; i++) {
          assign(kids[i]!, lane + (i - (kids.length - 1) / 2) * 0.8);
        }
      }
    };
    const spineId = spineByLifeArea.get(limbId);
    const rootSlots: number[] = [0];
    for (let step = 1; rootSlots.length < roots.length; step += 1) {
      rootSlots.push(-step);
      if (rootSlots.length < roots.length) rootSlots.push(step);
    }
    const orderedRoots = [...roots].sort((a, b) => {
      if (spineId && a.id === spineId) return -1;
      if (spineId && b.id === spineId) return 1;
      return (branchRow(a.id)?.createdAt ?? "").localeCompare(branchRow(b.id)?.createdAt ?? "");
    });
    orderedRoots.forEach((r, i) => assign(r, rootSlots[i] ?? 0));

    const nB = Math.max(1, branchesWithContent.length);
    const withGoals = branchesWithContent.filter((b) => goalIds.has(goalSyntheticId(b.id)));
    branchesWithContent.forEach((br) => {
      const x = colCenter + (laneByBranch.get(br.id) ?? 0) * ROADMAP_BRANCH_LANE_WIDTH;
      const ms = byBranch.get(br.id) ?? [];
      const gid = goalSyntheticId(br.id);
      const hasGoal = goalIds.has(gid);

      branchLanes.push({
        branchId: br.id,
        limbId,
        x,
        label: branchDisplayName(br),
        isChild: Boolean(br.parentBranchId),
        showLabel: nB > 1,
      });

      if (ms.length > 0) {
        const maxScore = Math.max(0, limbPastScoreMax.get(limbId) ?? 0);
        const singleNoBirth = (limbPastCount.get(limbId) ?? 0) === 1 && birthAnchor == null;
        ms.forEach((m) => {
          const score = limbPastScoreByMarkId.get(m.id) ?? 0;
          const rawFrac = singleNoBirth ? 0.5 : maxScore <= 0 ? 0 : score / maxScore;
          const frac = Math.min(1, Math.max(0, rawFrac));
          const ideal = Y_PAST_BOTTOM - frac * (Y_PAST_BOTTOM - Y_PAST_TOP);
          pastIdeals.push({ id: m.id, ideal, limb: limbId });
          const node = nodeById.get(m.id);
          if (node) {
            node.x = x;
          }
        });
      }

      if (hasGoal) {
        const goalIndex = withGoals.findIndex((b) => b.id === br.id);
        const nGoals = withGoals.length;
        const fracG = nGoals <= 1 ? 0.5 : goalIndex / Math.max(1, nGoals - 1);
        const ideal = Y_FUTURE_BOTTOM - fracG * (Y_FUTURE_BOTTOM - Y_FUTURE_TOP);
        futureByLimb.get(limbId)!.push({ id: gid, ideal, limb: limbId });
        const node = nodeById.get(gid);
        if (node) {
          node.x = x;
        }
      }
    });

    const rootChildrenX: number[] = [];
    for (const n of nodes) {
      if (n.parentId !== rid) continue;
      if (n.tree !== limbId) continue;
      if (Number.isFinite(n.x)) rootChildrenX.push(n.x);
    }
    if (root && rootChildrenX.length > 0) {
      root.x = (Math.min(...rootChildrenX) + Math.max(...rootChildrenX)) / 2;
    }
  }

  for (const limbId of lifeAreas) {
    const limbPast = pastIdeals.filter((p) => p.limb === limbId);
    const yMap = packYMonotonic(
      limbPast.map((p) => ({ id: p.id, ideal: p.ideal })),
      Y_PAST_TOP + PAST_PAD,
      Y_PAST_BOTTOM - PAST_PAD,
    );
    for (const p of limbPast) {
      const node = nodeById.get(p.id);
      const y = yMap.get(p.id);
      if (node && y != null) node.y = y;
    }

    const limbFut = futureByLimb.get(limbId) ?? [];
    if (limbFut.length > 0) {
      const fMap = packYMonotonic(
        limbFut.map((f) => ({ id: f.id, ideal: f.ideal })),
        Y_FUTURE_TOP + FUTURE_PAD,
        Y_FUTURE_BOTTOM - FUTURE_PAD,
      );
      for (const f of limbFut) {
        const node = nodeById.get(f.id);
        const y = fMap.get(f.id);
        if (node && y != null) node.y = y;
      }
    }
  }

  enforceTreeParentChildY(
    nodeById,
    ROADMAP_MIN_PARENT_CHILD_Y_GAP,
    ROADMAP_MIN_LIFE_AREA_ROOT_CHILD_Y_GAP,
    ROADMAP_MAX_LIFE_AREA_ROOT_CHILD_Y_GAP,
  );

  for (const n of nodes) {
    if (n.x !== 0 || n.y !== 0) continue;
    const colIndex = lifeAreas.indexOf(n.tree);
    if (colIndex < 0) continue;
    n.x = colIndex * colInner + colInner / 2;
    n.y = n.past ? (Y_PAST_TOP + Y_PAST_BOTTOM) / 2 : (Y_FUTURE_TOP + Y_FUTURE_BOTTOM) / 2;
  }

  const edges: RoadmapEdge[] = [];
  for (const n of nodes) {
    if (n.parentId) edges.push([n.parentId, n.id]);
  }

  for (const lane of branchLanes) {
    const marksInBranch = byBranch.get(lane.branchId) ?? [];
    let x: number | undefined;
    let topY = Infinity;
    for (const m of marksInBranch) {
      const n = nodeById.get(m.id);
      if (!n) continue;
      if (n.y < topY) {
        topY = n.y;
        x = n.x;
      }
    }
    const gid = goalSyntheticId(lane.branchId);
    if (goalIds.has(gid)) {
      const g = nodeById.get(gid);
      if (g && g.y < topY) x = g.x;
    }
    lane.x = x ?? nodeById.get(roadmapLifeAreaRootId(lane.limbId))?.x ?? lane.x;
  }

  return { nodes, edges, byBranch, layoutWidth, branchLanes };
}
