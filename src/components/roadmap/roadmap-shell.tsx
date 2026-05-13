"use client";

import { CreateMarkModal } from "@/components/roadmap/create-mark-modal";
import {
  MOCK_PROFILE_LABELS,
  getMockScenario,
  type MockDensity,
  type MockProfileId,
} from "@/data/mock-data";
import { PfChromeTopbar, PfChromeViewsNav } from "@/components/shell/pf-chrome";
import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";
import type { ApiBranchRow } from "@/lib/api-branch-row";
import { isEnabled } from "@/lib/flags";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getLifeArea } from "@/lib/life-areas";
import {
  buildPrimarySpineByLifeArea,
  ROADMAP_LIFE_AREA_ROOT_PREFIX,
  ROADMAP_LIFE_AREA_COLUMN_ORDER,
  ROADMAP_LIFE_AREA_ROOT_NODE_R,
  ROADMAP_NODE_R,
  ROADMAP_NOW_Y,
  ROADMAP_REF_WIDTH,
  ROADMAP_SVG_H,
  goalSyntheticId,
  type RoadmapBranchInput,
  type RoadmapMarkInput,
  type RoadmapNode,
  buildRoadmapLayout,
  getRoadmapLifeAreaColor,
  getRoadmapLifeAreaSub,
  roadmapEdgeUsesForkFlare,
  roadmapTreeMeta,
  resolveChronologyParentBranchId,
  resolveParentBranchAnchor,
} from "@/lib/roadmap/roadmap-data";
import type { Branch, LimbId, Mark } from "@/lib/types";

const MOCK_DENSITY_STORAGE_KEY = "pathfinder_mock_density";
const MOCK_PROFILE_STORAGE_KEY = "pathfinder_mock_profile";
const ROADMAP_LIFE_AREA_ROOT_VIS = ROADMAP_LIFE_AREA_ROOT_NODE_R / ROADMAP_NODE_R;
const ROADMAP_INITIAL_ZOOM = 0.65;
const ROADMAP_OVERVIEW_CANVAS_MIN_WIDTH = 2200;
const ROADMAP_NODE_VIS_SCALE = 1.35;
const ROADMAP_LINE_VIS_SCALE = 1.5;
const ROADMAP_MIN_SCREEN_STROKE_PX = 2.6;

function mockScenarioToRoadmapInputs(scenario: {
  branches: Branch[];
  marks: Mark[];
}): { marks: RoadmapMarkInput[]; branches: RoadmapBranchInput[] } {
  const branches: RoadmapBranchInput[] = scenario.branches.map((b) => ({
    id: b.id,
    limbId: b.limbId,
    name: b.name ?? b.label,
    label: b.label,
    goal: b.goal ?? null,
    goalValue: b.goalValue ?? null,
    currentValue: b.currentValue ?? null,
    unit: b.unit ?? null,
    parentBranchId: b.parentBranchId ?? null,
    turningPointId: b.turningPointId ?? null,
    order: b.order ?? 0,
    createdAt: b.createdAt,
  }));
  const marks: RoadmapMarkInput[] = scenario.marks.map((m) => ({
    id: m.id,
    branchId: m.branchId,
    limbId: m.limbId,
    title: m.title,
    description: m.description,
    date: m.date,
    type: m.type,
  }));
  return { marks, branches };
}

function initialsFromProfile(name: string, email: string): string {
  const n = name.trim();
  if (n.length >= 2) return (n[0] + n[1]).toUpperCase();
  if (n.length === 1) {
    const e = (email[0] ?? "?").toUpperCase();
    return `${n[0].toUpperCase()}${e}`;
  }
  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local.length === 1) return `${local[0].toUpperCase()}P`;
  return "PF";
}

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getDarkSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerDarkSnapshot() {
  return false;
}

/** Organic branch connector (parent → child) for the tree layout. */
function branchBezierEdgePath(x1: number, y1: number, x2: number, y2: number, isForkEdge: boolean): string {
  const dy = y2 - y1;
  const dx = x2 - x1;
  if (!isForkEdge) {
    // Main spine edges stay gently vertical with a soft ease-in/ease-out.
    const cp1y = y1 + dy * 0.32;
    const cp2y = y1 + dy * 0.74;
    return `M ${x1},${y1} C ${x1},${cp1y} ${x2},${cp2y} ${x2},${y2}`;
  }
  const span = Math.abs(dx);
  // Natural preset: smooth C-curve, less stylized than sweeping mode.
  // Keep start tangent closer to the parent line to remove sharp-looking takeoffs.
  const cp1x = x1 + dx * (span < 56 ? 0.14 : 0.18);
  const cp2x = x1 + dx * (span < 56 ? 0.78 : 0.84);
  const cp1y = y1 + dy * 0.4;
  const cp2y = y1 + dy * 0.7;
  return `M ${x1},${y1} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;
}

export function RoadmapShell() {
  const useMockData = isEnabled("MOCK_DATA");
  const [mockDensity, setMockDensity] = useState<MockDensity>("med");
  const [mockProfileId, setMockProfileId] = useState<MockProfileId>("alex");
  const [marks, setMarks] = useState<RoadmapMarkInput[]>([]);
  const [branches, setBranches] = useState<RoadmapBranchInput[]>([]);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hiddenLifeAreaIds, setHiddenLifeAreaIds] = useState<Set<LimbId>>(() => new Set());
  const [hover, setHover] = useState<{
    node: RoadmapNode;
    left: number;
    top: number;
  } | null>(null);
  const [addMarkOpen, setAddMarkOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const svgInitRef = useRef(false);
  const panDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const bounceRafRef = useRef<number | null>(null);
  const wheelZoomActiveRef = useRef(false);
  const wheelZoomTimeoutRef = useRef<number | null>(null);

  const [viewportW, setViewportW] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(ROADMAP_INITIAL_ZOOM);
  const [panPointerDown, setPanPointerDown] = useState(false);

  const isDark = useSyncExternalStore(subscribeDark, getDarkSnapshot, getServerDarkSnapshot);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (useMockData) {
        const scenario = getMockScenario(mockProfileId, mockDensity);
        const { marks: mm, branches: bb } = mockScenarioToRoadmapInputs(scenario);
        setMarks(mm);
        setBranches(bb);
        setUserName(scenario.profile.name);
        setUserEmail(scenario.profile.email);
        setBirthYear(scenario.profile.birthYear ?? null);
        return;
      }
      const [marksRes, branchesRes] = await Promise.all([
        fetch("/api/marks", { cache: "no-store" }),
        fetch("/api/branches", { cache: "no-store" }),
      ]);
      if (marksRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!marksRes.ok) {
        setError(true);
        setBirthYear(null);
        return;
      }
      const md = (await marksRes.json()) as {
        marks?: RoadmapMarkInput[];
        user?: { name?: string; email?: string; birthYear?: number | null };
      };
      setMarks(Array.isArray(md.marks) ? md.marks : []);
      setUserName(md.user?.name ?? "");
      setUserEmail(md.user?.email ?? "");
      const by = md.user?.birthYear;
      let nextBirth: number | null = null;
      if (typeof by === "number" && Number.isFinite(by)) nextBirth = by;
      else if (by != null) {
        const n = Number(by);
        if (Number.isFinite(n)) nextBirth = n;
      }
      setBirthYear(nextBirth);

      if (branchesRes.ok) {
        const bd = (await branchesRes.json()) as { branches?: RoadmapBranchInput[] };
        setBranches(Array.isArray(bd.branches) ? bd.branches : []);
      } else {
        setBranches([]);
      }
    } catch {
      setError(true);
      setBirthYear(null);
    } finally {
      setLoading(false);
    }
  }, [mockDensity, mockProfileId, useMockData]);

  useEffect(() => {
    if (!useMockData) return;
    try {
      const stored = window.localStorage.getItem(MOCK_DENSITY_STORAGE_KEY);
      if (stored === "min" || stored === "med" || stored === "extensive") {
        setMockDensity(stored);
      }
      const storedProfile = window.localStorage.getItem(MOCK_PROFILE_STORAGE_KEY);
      if (storedProfile === "alex" || storedProfile === "david") {
        setMockProfileId(storedProfile);
      }
    } catch {
      /* ignore */
    }
  }, [useMockData]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    svgInitRef.current = false;
  }, [marks, branches, birthYear]);

  const visibleLifeAreas = useMemo((): LimbId[] => {
    const v = ROADMAP_LIFE_AREA_COLUMN_ORDER.filter((id) => !hiddenLifeAreaIds.has(id));
    return v.length > 0 ? v : [...ROADMAP_LIFE_AREA_COLUMN_ORDER];
  }, [hiddenLifeAreaIds]);

  const viewWForLayout = viewportW > 0 ? viewportW : 0;
  const { nodes, edges, layoutWidth, branchLanes } = useMemo(
    () =>
      buildRoadmapLayout(marks, branches, {
        birthYear,
        visibleLifeAreaIds: visibleLifeAreas,
        // Keep internal limb spacing aligned with the rendered canvas width at overview zoom.
        minLayoutWidth: Math.max(ROADMAP_OVERVIEW_CANVAS_MIN_WIDTH, viewWForLayout || 0),
      }),
    [marks, branches, birthYear, visibleLifeAreas, viewportW],
  );

  const trees = useMemo(() => roadmapTreeMeta(), []);

  const addMarkDefaultLifeArea = useMemo((): LimbId => {
    for (const id of ROADMAP_LIFE_AREA_COLUMN_ORDER) {
      if (!hiddenLifeAreaIds.has(id)) return id;
    }
    return "work";
  }, [hiddenLifeAreaIds]);

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const edgeSegmentStartByPair = useMemo(() => {
    const byBranch = new Map<string, RoadmapMarkInput[]>();
    for (const m of marks) {
      const arr = byBranch.get(m.branchId) ?? [];
      arr.push(m);
      byBranch.set(m.branchId, arr);
    }
    for (const arr of byBranch.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    const spineByLifeArea = buildPrimarySpineByLifeArea(branches, marks);
    const map = new Map<string, { nextParentMarkId: string; t: number }>();
    for (const br of branches) {
      if (!br.parentBranchId) continue;
      const childMarks = byBranch.get(br.id) ?? [];
      if (childMarks.length === 0) continue;
      const chronologyParentBranchId = resolveChronologyParentBranchId(br, spineByLifeArea);
      if (!chronologyParentBranchId) continue;
      const parentTurningPointId =
        chronologyParentBranchId === br.parentBranchId ? br.turningPointId : null;
      const parentMarks = byBranch.get(chronologyParentBranchId) ?? [];
      const childFirst = childMarks[0]!;
      const anchor = resolveParentBranchAnchor(parentMarks, parentTurningPointId, childFirst.date);
      if (!anchor.anchorMark || !anchor.nextParentMarkId || anchor.t == null) continue;
      if (anchor.t <= 0 || anchor.t >= 1) continue;
      map.set(`${anchor.anchorMark.id}::${childFirst.id}`, {
        nextParentMarkId: anchor.nextParentMarkId,
        t: anchor.t,
      });
    }
    return map;
  }, [branches, marks]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b] as const)), [branches]);
  const spineEdgeKeys = useMemo(() => {
    const byBranch = new Map<string, RoadmapMarkInput[]>();
    for (const m of marks) {
      const arr = byBranch.get(m.branchId) ?? [];
      arr.push(m);
      byBranch.set(m.branchId, arr);
    }
    for (const arr of byBranch.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    const spineByLifeArea = buildPrimarySpineByLifeArea(branches, marks);
    const set = new Set<string>();
    for (const [lifeAreaId, spineBranchId] of spineByLifeArea) {
      const series = byBranch.get(spineBranchId) ?? [];
      const branch = branchById.get(spineBranchId);
      const goalId = goalSyntheticId(spineBranchId);
      const hasGoal = Boolean((branch?.goal ?? "").trim());
      if (series.length > 0) {
        set.add(`${ROADMAP_LIFE_AREA_ROOT_PREFIX}${lifeAreaId}::${series[0]!.id}`);
        for (let i = 0; i < series.length - 1; i += 1) {
          set.add(`${series[i]!.id}::${series[i + 1]!.id}`);
        }
        if (hasGoal) set.add(`${series[series.length - 1]!.id}::${goalId}`);
      } else if (hasGoal) {
        set.add(`${ROADMAP_LIFE_AREA_ROOT_PREFIX}${lifeAreaId}::${goalId}`);
      }
    }
    return set;
  }, [branchById, branches, marks]);
  const branchLabelAnchors = useMemo(() => {
    const marksByBranch = new Map<string, RoadmapMarkInput[]>();
    for (const m of marks) {
      const arr = marksByBranch.get(m.branchId) ?? [];
      arr.push(m);
      marksByBranch.set(m.branchId, arr);
    }
    for (const arr of marksByBranch.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    const rawAnchors = new Map<string, { x: number; y: number; limbId: LimbId }>();
    for (const lane of branchLanes) {
      const branch = branchById.get(lane.branchId);
      const firstMark = (marksByBranch.get(lane.branchId) ?? [])[0];
      const firstNode = firstMark ? nodeMap[firstMark.id] : null;
      const turningNode = branch?.turningPointId ? nodeMap[branch.turningPointId] : null;
      const rootNode = nodeMap[`${ROADMAP_LIFE_AREA_ROOT_PREFIX}${lane.limbId}`];
      const anchorNode = firstNode ?? turningNode ?? rootNode;
      rawAnchors.set(lane.branchId, {
        x: firstNode?.x ?? lane.x,
        y: (anchorNode?.y ?? ROADMAP_NOW_Y) + 14,
        limbId: lane.limbId,
      });
    }

    // Avoid overlapping labels around shared start points by staggering Y per limb.
    const anchors = new Map<string, { x: number; y: number }>();
    const byLimb = new Map<LimbId, Array<{ id: string; x: number; y: number }>>();
    for (const [id, a] of rawAnchors) {
      const arr = byLimb.get(a.limbId) ?? [];
      arr.push({ id, x: a.x, y: a.y });
      byLimb.set(a.limbId, arr);
    }
    for (const entries of byLimb.values()) {
      entries.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
      const placed: Array<{ x: number; y: number }> = [];
      for (const e of entries) {
        let y = e.y;
        let guard = 0;
        while (
          placed.some((p) => Math.abs(p.x - e.x) < 80 && Math.abs(p.y - y) < 11) &&
          guard < 8
        ) {
          y += 11;
          guard += 1;
        }
        placed.push({ x: e.x, y });
        anchors.set(e.id, { x: e.x, y });
      }
    }
    return anchors;
  }, [branchById, branchLanes, marks, nodeMap]);

  const childCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [a] of edges) {
      c[a] = (c[a] ?? 0) + 1;
    }
    return c;
  }, [edges]);

  const initialFocus = useMemo(() => {
    const roots = nodes.filter((n) => n.id.startsWith(ROADMAP_LIFE_AREA_ROOT_PREFIX));
    if (roots.length === 0) return null;
    const childrenByParent = new Map<string, RoadmapNode[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      const arr = childrenByParent.get(n.parentId) ?? [];
      arr.push(n);
      childrenByParent.set(n.parentId, arr);
    }
    const picked = new Map<string, RoadmapNode>();
    for (const root of roots) {
      picked.set(root.id, root);
      for (const c of childrenByParent.get(root.id) ?? []) {
        picked.set(c.id, c);
        for (const gc of childrenByParent.get(c.id) ?? []) picked.set(gc.id, gc);
      }
    }
    const focus = [...picked.values()];
    if (focus.length === 0) return null;
    const minX = Math.min(...focus.map((n) => n.x));
    const maxX = Math.max(...focus.map((n) => n.x));
    const minY = Math.min(...focus.map((n) => n.y));
    const maxY = Math.max(...focus.map((n) => n.y));
    const rootY = roots.reduce((s, r) => s + r.y, 0) / roots.length;
    return { minX, maxX, minY, maxY, rootY };
  }, [nodes]);

  const nx = (n: RoadmapNode) => n.x;

  const INK500 = "#6B7280";
  const INK900 = isDark ? "#E8EAEC" : "#1A1C1E";
  const BGEL = isDark ? "#242628" : "#FFFFFF";

  const effectiveLayoutWidth = Math.max(layoutWidth, ROADMAP_OVERVIEW_CANVAS_MIN_WIDTH);

  const viewW = viewportW > 0 ? viewportW : ROADMAP_REF_WIDTH;
  const viewH = viewportH > 0 ? viewportH : ROADMAP_SVG_H;
  const INITIAL_CAMERA_LEFT_BIAS_PX = 64;
  const INITIAL_ROOT_SCREEN_Y_RATIO = 0.5;
  const PAN_BOTTOM_HEADROOM_PX = 260;
  const contentW = effectiveLayoutWidth * zoom;
  const contentH = ROADMAP_SVG_H * zoom;
  const minPanX = Math.min(0, viewW - contentW);
  const minPanY = Math.min(0, viewH - contentH);
  const canPan = minPanX < -0.5 || minPanY < -0.5;
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 2.2;
  const PAN_OVERSCROLL_PX = 120;

  const panBoundsForZoom = useCallback(
    (nextZoom: number) => {
      const contentWForZoom = effectiveLayoutWidth * nextZoom;
      const contentHForZoom = ROADMAP_SVG_H * nextZoom;
      const centeredX = (viewW - contentWForZoom) / 2;
      const centeredY = (viewH - contentHForZoom) / 2;
      const nextMinPanX = contentWForZoom <= viewW ? centeredX : viewW - contentWForZoom;
      const nextMaxPanX = contentWForZoom <= viewW ? centeredX : 0;
      const nextMinPanY = contentHForZoom <= viewH ? centeredY : viewH - contentHForZoom;
      const nextMaxPanY = contentHForZoom <= viewH ? centeredY : PAN_BOTTOM_HEADROOM_PX;
      return { minX: nextMinPanX, maxX: nextMaxPanX, minY: nextMinPanY, maxY: nextMaxPanY };
    },
    [effectiveLayoutWidth, viewH, viewW],
  );

  const clampPanForZoom = useCallback(
    (nextPan: { x: number; y: number }, nextZoom: number) => {
      const b = panBoundsForZoom(nextZoom);
      return {
        x: Math.max(b.minX, Math.min(b.maxX, nextPan.x)),
        y: Math.max(b.minY, Math.min(b.maxY, nextPan.y)),
      };
    },
    [panBoundsForZoom],
  );

  const clampPanWithOverscroll = useCallback(
    (nextPan: { x: number; y: number }, nextZoom: number) => {
      const b = panBoundsForZoom(nextZoom);
      return {
        x: Math.max(b.minX - PAN_OVERSCROLL_PX, Math.min(b.maxX + PAN_OVERSCROLL_PX, nextPan.x)),
        y: Math.max(b.minY - PAN_OVERSCROLL_PX, Math.min(b.maxY + PAN_OVERSCROLL_PX, nextPan.y)),
      };
    },
    [panBoundsForZoom],
  );

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportW(el.clientWidth || 0);
      setViewportH(el.clientHeight || 0);
    });
    ro.observe(el);
    setViewportW(el.clientWidth || 0);
    setViewportH(el.clientHeight || 0);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const stopBounce = useCallback(() => {
    if (bounceRafRef.current != null) {
      window.cancelAnimationFrame(bounceRafRef.current);
      bounceRafRef.current = null;
    }
  }, []);

  const markWheelZoomActive = useCallback(() => {
    wheelZoomActiveRef.current = true;
    if (wheelZoomTimeoutRef.current != null) {
      window.clearTimeout(wheelZoomTimeoutRef.current);
    }
    wheelZoomTimeoutRef.current = window.setTimeout(() => {
      wheelZoomActiveRef.current = false;
      wheelZoomTimeoutRef.current = null;
    }, 90);
  }, []);

  const bouncePanBack = useCallback(() => {
    stopBounce();
    const tick = () => {
      const target = clampPanForZoom(panRef.current, zoom);
      const dx = target.x - panRef.current.x;
      const dy = target.y - panRef.current.y;
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) {
        setPan(target);
        bounceRafRef.current = null;
        return;
      }
      setPan({
        x: panRef.current.x + dx * 0.22,
        y: panRef.current.y + dy * 0.22,
      });
      bounceRafRef.current = window.requestAnimationFrame(tick);
    };
    bounceRafRef.current = window.requestAnimationFrame(tick);
  }, [clampPanForZoom, stopBounce, zoom]);

  useEffect(
    () => () => {
      stopBounce();
      if (wheelZoomTimeoutRef.current != null) {
        window.clearTimeout(wheelZoomTimeoutRef.current);
        wheelZoomTimeoutRef.current = null;
      }
    },
    [stopBounce],
  );

  useEffect(() => {
    if (panPointerDown) return;
    if (wheelZoomActiveRef.current) return;
    setPan((curr) => clampPanForZoom(curr, zoom));
  }, [clampPanForZoom, panPointerDown, zoom]);

  useEffect(() => {
    if (panPointerDown) return;
    if (wheelZoomActiveRef.current) return;
    const clamped = clampPanForZoom(pan, zoom);
    if (Math.abs(clamped.x - pan.x) > 0.1 || Math.abs(clamped.y - pan.y) > 0.1) {
      bouncePanBack();
    }
  }, [bouncePanBack, clampPanForZoom, pan, panPointerDown, zoom]);

  const onPanPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canPan) return;
      if (e.button !== 0) return;
      stopBounce();
      e.currentTarget.setPointerCapture(e.pointerId);
      panDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: panRef.current.x,
        startPanY: panRef.current.y,
      };
      setPanPointerDown(true);
    },
    [canPan, stopBounce],
  );

  const onPanPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = panDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      setPan(
        clampPanWithOverscroll(
          {
            x: drag.startPanX + dx,
            y: drag.startPanY + dy,
          },
          zoom,
        ),
      );
    },
    [clampPanWithOverscroll, zoom],
  );

  const onPanPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    panDragRef.current = null;
    setPanPointerDown(false);
    bouncePanBack();
  }, [bouncePanBack]);

  const onPanWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      stopBounce();
      markWheelZoomActive();
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const worldX = (localX - panRef.current.x) / zoom;
      const worldY = (localY - panRef.current.y) / zoom;
      const linePx = 16;
      const pagePx = Math.max(1, viewH);
      const rawDelta =
        e.deltaMode === 1 ? e.deltaY * linePx : e.deltaMode === 2 ? e.deltaY * pagePx : e.deltaY;
      // Faster zoom response while keeping smooth control.
      const smoothedDelta = Math.max(-64, Math.min(64, rawDelta));
      const zoomFactor = Math.exp(-smoothedDelta * 0.00072);
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));
      const nextPan = clampPanForZoom(
        {
          x: localX - worldX * nextZoom,
          y: localY - worldY * nextZoom,
        },
        nextZoom,
      );
      setZoom(nextZoom);
      setPan(nextPan);
    },
    [clampPanForZoom, markWheelZoomActive, stopBounce, zoom],
  );

  const toggleLifeArea = useCallback((id: LimbId) => {
    setHiddenLifeAreaIds((prev) => {
      const currentlyVisible = ROADMAP_LIFE_AREA_COLUMN_ORDER.filter((limbId) => !prev.has(limbId));
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (currentlyVisible.length <= 1 && currentlyVisible[0] === id) {
        // If user toggles off the last visible limb, reset to "show all" so UI matches canvas.
        next.clear();
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (svgInitRef.current) return;
    const wrap = canvasWrapRef.current;
    if (!wrap || loading) return;
    svgInitRef.current = true;
    if (!initialFocus || viewW <= 0 || viewH <= 0) {
      setPan((curr) => clampPanForZoom(curr, zoom));
      return;
    }
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, ROADMAP_INITIAL_ZOOM));
    const focusCenterX = (initialFocus.minX + initialFocus.maxX) / 2;
    const nextPan = clampPanForZoom(
      {
        x: viewW / 2 - focusCenterX * nextZoom - INITIAL_CAMERA_LEFT_BIAS_PX,
        y: viewH * INITIAL_ROOT_SCREEN_Y_RATIO - initialFocus.rootY * nextZoom,
      },
      nextZoom,
    );
    setZoom(nextZoom);
    setPan(nextPan);
    return undefined;
  }, [clampPanForZoom, effectiveLayoutWidth, initialFocus, loading, nodes.length, viewH, viewW, visibleLifeAreas]);

  // Keep linework readable at low zoom by compensating stroke widths in SVG units.
  const zoomCompStroke = useCallback(
    (basePx: number) =>
      Math.max(
        ROADMAP_MIN_SCREEN_STROKE_PX / Math.max(zoom, 0.001),
        (basePx * ROADMAP_LINE_VIS_SCALE) / Math.max(zoom, 0.001),
      ),
    [zoom],
  );
  const zoomCompFont = useCallback((basePx: number) => basePx / Math.max(zoom, 0.001), [zoom]);

  const onNodeEnter = useCallback(
    (e: React.MouseEvent, n: RoadmapNode) => {
      const mainR = mainRef.current?.getBoundingClientRect();
      const target = e.currentTarget as SVGGElement;
      const nr = target.getBoundingClientRect();
      if (!mainR) return;
      const cx = nr.left - mainR.left + nr.width / 2;
      const cy = nr.top - mainR.top + nr.height / 2;
      setHover({ node: n, left: cx, top: cy });
    },
    [],
  );

  const onNodeLeave = useCallback(() => setHover(null), []);

  const avatarInitials = initialsFromProfile(userName, userEmail);

  return (
    <div className="pf-roadmap min-h-dvh overflow-hidden text-[var(--rm-text1)]">
      <style>{PF_ROADMAP_THEME_CSS}</style>

      <div className="pf-roadmap-shell bg-[var(--rm-canvas)]">
        <PfChromeTopbar
          shell="roadmap"
          avatarInitials={avatarInitials}
          avatarLoading={loading}
          avatarTitle={userName || userEmail || "Profile"}
        />

        <aside className="rm-sidebar">
          <PfChromeViewsNav shell="roadmap" />
          <div className="rm-sidebar-divider" />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mb-1.5 px-5 text-[10px] font-medium uppercase tracking-wider text-[var(--rm-text3)]">
              Themes
            </div>
            {ROADMAP_LIFE_AREA_COLUMN_ORDER.map((limbId) => {
              const limb = getLifeArea(limbId);
              if (!limb) return null;
              const col = getRoadmapLifeAreaColor(limbId, isDark);
              const off = !visibleLifeAreas.includes(limbId);
              return (
                <button
                  key={limbId}
                  type="button"
                  className={`rm-tree-toggle${off ? " rm-off" : ""}`}
                  onClick={() => toggleLifeArea(limbId)}
                >
                  <div className="rm-tree-dot" style={{ background: col }} />
                  <span className="rm-tree-name">{limb.label}</span>
                  <div className="rm-toggle-pill" />
                </button>
              );
            })}
            <div className="mt-auto">
              <div className="rm-sidebar-divider" />
              <div className="flex flex-col gap-2 px-5 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--rm-text3)]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <circle
                  cx="6"
                  cy="6"
                  r="5"
                  fill="#4A8FA8"
                  opacity="0.2"
                  stroke="#4A8FA8"
                  strokeWidth="1.2"
                />
                <circle cx="6" cy="6" r="2" fill="#4A8FA8" />
              </svg>
              Past goal
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--rm-text3)]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <circle
                  cx="6"
                  cy="6"
                  r="5"
                  fill="none"
                  stroke="#4A8FA8"
                  strokeWidth="1.2"
                  strokeDasharray="2.5 2"
                />
                <circle cx="6" cy="6" r="2" fill="#4A8FA8" opacity="0.4" />
              </svg>
              Future goal
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--rm-text3)]">
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden>
                <polygon points="6,0 12,10 0,10" fill="#5B6FD4" opacity="0.5" />
              </svg>
              Split (child branch)
            </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="rm-main" ref={mainRef}>
          <div className="rm-page-header">
            <h1 className="rm-page-title">Roadmap</h1>
            {useMockData ? (
              <div
                className="shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-wider"
                style={{ background: "#F59E0B", color: "#0B1220" }}
              >
                Mock data
              </div>
            ) : null}
            {useMockData ? (
              <div
                className="inline-flex shrink-0 overflow-hidden rounded-full border"
                style={{ borderColor: "var(--rm-border)" }}
              >
                {(["alex", "david"] as MockProfileId[]).map((pid) => {
                  const active = mockProfileId === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => {
                        setMockProfileId(pid);
                        try {
                          window.localStorage.setItem(MOCK_PROFILE_STORAGE_KEY, pid);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="border-0 px-2.5 py-1 text-[10px] uppercase tracking-wide transition-colors"
                      style={{
                        background: active ? "var(--rm-bgEl)" : "transparent",
                        color: active ? "var(--rm-text1)" : "var(--rm-text3)",
                      }}
                    >
                      {MOCK_PROFILE_LABELS[pid].split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {useMockData ? (
              <div
                className="inline-flex shrink-0 overflow-hidden rounded-full border"
                style={{ borderColor: "var(--rm-border)" }}
              >
                {(["min", "med", "extensive"] as MockDensity[]).map((density) => {
                  const active = mockDensity === density;
                  return (
                    <button
                      key={density}
                      type="button"
                      onClick={() => {
                        setMockDensity(density);
                        try {
                          window.localStorage.setItem(MOCK_DENSITY_STORAGE_KEY, density);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="border-0 px-2.5 py-1 text-[10px] uppercase tracking-wide transition-colors"
                      style={{
                        background: active ? "var(--rm-bgEl)" : "transparent",
                        color: active ? "var(--rm-text1)" : "var(--rm-text3)",
                      }}
                    >
                      {density}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!useMockData ? (
              <button
                type="button"
                onClick={() => setAddMarkOpen(true)}
                className="shrink-0 rounded-lg border-0 px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--rm-ink900)" }}
              >
                + Add timeline note
              </button>
            ) : null}
            <div
              className="inline-flex shrink-0 overflow-hidden rounded-full border"
              style={{ borderColor: "var(--rm-border)" }}
            >
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.12))}
                className="border-0 px-2.5 py-1 text-[10px] uppercase tracking-wide transition-colors"
                style={{ color: "var(--rm-text2)", background: "transparent" }}
              >
                -
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(ROADMAP_INITIAL_ZOOM);
                  setPan({ x: 0, y: 0 });
                }}
                className="border-0 px-2.5 py-1 text-[10px] tabular-nums tracking-wide transition-colors"
                style={{ color: "var(--rm-text2)", background: "transparent" }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.12))}
                className="border-0 px-2.5 py-1 text-[10px] uppercase tracking-wide transition-colors"
                style={{ color: "var(--rm-text2)", background: "transparent" }}
              >
                +
              </button>
            </div>
            <div className="rm-legend">
              {ROADMAP_LIFE_AREA_COLUMN_ORDER.map((limbId) => {
                const l = getLifeArea(limbId);
                if (!l) return null;
                const dot = getRoadmapLifeAreaColor(limbId, isDark);
                const short =
                  limbId === "finance"
                    ? "Money"
                    : limbId === "becoming"
                      ? "Self"
                      : limbId === "people"
                        ? "People"
                        : l.label.split("&")[0].trim();
                return (
                  <div key={limbId} className="rm-leg-item">
                    <span
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ background: dot }}
                    />
                    {short}
                  </div>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="absolute left-1/2 top-24 z-10 max-w-md -translate-x-1/2 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-bgEl)] px-4 py-2 text-center text-[13px] text-[var(--rm-text2)]">
              Couldn&apos;t load roadmap data.{" "}
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-[var(--rm-text2)] underline"
                onClick={() => void reload()}
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className="rm-canvas-wrap" ref={canvasWrapRef}>
            <div
              className="rm-pan-viewport"
              style={{
                height: "100%",
                overflow: "hidden",
                width: "100%",
              }}
            >
              <div
                className="rm-pan-surface"
                style={{
                  transform: `translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`,
                  transformOrigin: "0 0",
                  width: effectiveLayoutWidth,
                  height: ROADMAP_SVG_H,
                  cursor: canPan ? (panPointerDown ? "grabbing" : "grab") : "default",
                  touchAction: "none",
                }}
                onPointerDown={onPanPointerDown}
                onPointerMove={onPanPointerMove}
                onPointerUp={onPanPointerUp}
                onPointerCancel={onPanPointerUp}
                onLostPointerCapture={() => {
                  panDragRef.current = null;
                  setPanPointerDown(false);
                }}
                onWheel={onPanWheel}
                role="presentation"
              >
                <svg
                  width={effectiveLayoutWidth}
                  height={ROADMAP_SVG_H}
                  viewBox={`0 0 ${effectiveLayoutWidth} ${ROADMAP_SVG_H}`}
                  style={{ display: "block" }}
                  role="img"
                  aria-label="Branching roadmap timeline"
                >
              <defs>
                <linearGradient id="rmFutGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isDark ? "#16181A" : "#F5F3EE"}
                    stopOpacity="0"
                  />
                  <stop
                    offset="100%"
                    stopColor={isDark ? "#16181A" : "#F5F3EE"}
                    stopOpacity="0.18"
                  />
                </linearGradient>
                <linearGradient id="rmTopFade" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isDark ? "#1E2022" : "#EDEBE4"}
                    stopOpacity="1"
                  />
                  <stop
                    offset="100%"
                    stopColor={isDark ? "#1E2022" : "#EDEBE4"}
                    stopOpacity="0"
                  />
                </linearGradient>
                <linearGradient id="rmBotFade" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isDark ? "#1E2022" : "#EDEBE4"}
                    stopOpacity="0"
                  />
                  <stop
                    offset="100%"
                    stopColor={isDark ? "#1E2022" : "#EDEBE4"}
                    stopOpacity="1"
                  />
                </linearGradient>
              </defs>

              <rect x={0} y={0} width={effectiveLayoutWidth} height={ROADMAP_NOW_Y} fill="url(#rmFutGrad)" />

              {edges.map(([aId, bId]) => {
                const a = nodeMap[aId];
                const b = nodeMap[bId];
                if (!a || !b) return null;
                if (hiddenLifeAreaIds.has(a.tree) || hiddenLifeAreaIds.has(b.tree)) return null;
                let x1 = nx(a);
                let y1 = a.y;
                const x2 = nx(b);
                const y2 = b.y;
                const segKey = `${aId}::${bId}`;
                const seg = edgeSegmentStartByPair.get(segKey);
                if (seg) {
                  const nxt = nodeMap[seg.nextParentMarkId];
                  if (nxt) {
                    x1 = x1 + (nx(nxt) - x1) * seg.t;
                    y1 = y1 + (nxt.y - y1) * seg.t;
                  }
                }
                const col = getRoadmapLifeAreaColor(a.tree, isDark);
                const isTargetPath = a.type === "goal" || b.type === "goal";
                const isSpineEdge = spineEdgeKeys.has(`${aId}::${bId}`);
                const isForkEdge = roadmapEdgeUsesForkFlare(
                  aId,
                  childCount,
                  (id) => nodeMap[id]?.parentId,
                );
                const d = branchBezierEdgePath(x1, y1, x2, y2, isForkEdge);
                const strokeBase = isTargetPath ? 1.5 : 2;
                const strokeOpacityBase = isTargetPath ? 0.35 : 0.55;
                return (
                  <path
                    key={`e-${aId}-${bId}`}
                    d={d}
                    stroke={col}
                    strokeWidth={zoomCompStroke(isSpineEdge ? strokeBase * 1.24 : strokeBase)}
                    strokeOpacity={Math.min(0.9, strokeOpacityBase + (isSpineEdge ? 0.22 : 0))}
                    strokeDasharray={isTargetPath && !isSpineEdge ? "5 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                );
              })}

              {nodes.map((n) => {
                if (hiddenLifeAreaIds.has(n.tree)) return null;
                const x = nx(n);
                const y = n.y;
                const col = getRoadmapLifeAreaColor(n.tree, isDark);
                const sub = getRoadmapLifeAreaSub(n.tree, isDark);
                const fut = !n.past;
                const isLifeAreaRoot = n.id.startsWith(ROADMAP_LIFE_AREA_ROOT_PREFIX);
                const R = isLifeAreaRoot
                  ? ROADMAP_LIFE_AREA_ROOT_NODE_R * ROADMAP_NODE_VIS_SCALE
                  : n.type === "milestone"
                    ? ROADMAP_NODE_R * 1.05 * ROADMAP_NODE_VIS_SCALE
                    : ROADMAP_NODE_R * 0.82 * ROADMAP_NODE_VIS_SCALE;
                const diamondHalf = R / Math.SQRT2;

                const short = isLifeAreaRoot
                  ? n.label
                  : n.label.length > 24
                    ? `${n.label.slice(0, 23)}…`
                    : n.label;
                const labelX = x;
                const labelY = y + R + 12;
                const labelOp = fut ? "0.6" : "1";

                return (
                  <g key={n.id}>
                    <g
                      className="snode cursor-pointer"
                      data-id={n.id}
                      onMouseEnter={(e) => onNodeEnter(e, n)}
                      onMouseLeave={onNodeLeave}
                    >
                      <circle cx={x} cy={y} r={R + 8} fill="transparent" />
                      {n.type === "decision" ? (
                        fut ? (
                          <>
                            <rect
                              x={x - diamondHalf}
                              y={y - diamondHalf}
                              width={diamondHalf * 2}
                              height={diamondHalf * 2}
                              rx={isLifeAreaRoot ? 2.5 * ROADMAP_LIFE_AREA_ROOT_VIS : 2.5}
                              fill={BGEL}
                              stroke={col}
                              strokeWidth={zoomCompStroke(1.5)}
                              strokeDasharray="4 3"
                              opacity={0.8}
                              transform={`rotate(45 ${x} ${y})`}
                            />
                            <circle
                              cx={x}
                              cy={y}
                              r={isLifeAreaRoot ? 3.5 * ROADMAP_LIFE_AREA_ROOT_VIS * ROADMAP_NODE_VIS_SCALE : 3.5 * ROADMAP_NODE_VIS_SCALE}
                              fill={col}
                              opacity={0.35}
                            />
                          </>
                        ) : (
                          <>
                            <rect
                              x={x - diamondHalf}
                              y={y - diamondHalf}
                              width={diamondHalf * 2}
                              height={diamondHalf * 2}
                              rx={isLifeAreaRoot ? 2.5 * ROADMAP_LIFE_AREA_ROOT_VIS : 2.5}
                              fill={sub}
                              stroke={col}
                              strokeWidth={zoomCompStroke(1.85)}
                              transform={`rotate(45 ${x} ${y})`}
                            />
                            <text
                              x={x}
                              y={y + 1.5}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={zoomCompFont(
                                isLifeAreaRoot ? 8.5 * ROADMAP_LIFE_AREA_ROOT_VIS : 8.5,
                              )}
                              fill={col}
                              fontWeight={700}
                              style={{ pointerEvents: "none" }}
                            >
                              ◆
                            </text>
                          </>
                        )
                      ) : fut ? (
                        <>
                          <circle
                            cx={x}
                            cy={y}
                            r={R}
                            fill={BGEL}
                            stroke={col}
                            strokeWidth={zoomCompStroke(1.5)}
                            strokeDasharray="4 3"
                            opacity={0.75}
                          />
                          <circle
                            cx={x}
                            cy={y}
                            r={3.5 * ROADMAP_NODE_VIS_SCALE}
                            fill={col}
                            opacity={0.4}
                            style={{ pointerEvents: "none" }}
                          />
                        </>
                      ) : (
                        <>
                          <circle
                            cx={x}
                            cy={y}
                            r={R}
                            fill={sub}
                            stroke={col}
                            strokeWidth={zoomCompStroke(1.75)}
                          />
                          {n.type === "milestone" ? (
                            <text
                              x={x}
                              y={y + 1}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={zoomCompFont(9)}
                              fill={col}
                              style={{ pointerEvents: "none" }}
                            >
                              ★
                            </text>
                          ) : n.type === "realisation" ? (
                            <circle
                              cx={x}
                              cy={y}
                              r={3.5 * ROADMAP_NODE_VIS_SCALE}
                              fill={col}
                              style={{ pointerEvents: "none" }}
                            />
                          ) : n.type === "setback" ? (
                            <text
                              x={x}
                              y={y + 1.5}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={zoomCompFont(10)}
                              fill={col}
                              style={{ pointerEvents: "none" }}
                            >
                              ↓
                            </text>
                          ) : null}
                        </>
                      )}
                    </g>
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fontFamily: "var(--font-pf-roadmap-sans), DM Sans, sans-serif",
                        fontSize: zoomCompFont(11),
                        fill: fut ? INK500 : INK900,
                        opacity: labelOp,
                        fontWeight: n.type === "decision" ? 500 : 400,
                        pointerEvents: "none",
                      }}
                    >
                      {short}
                    </text>
                    <text
                      x={labelX}
                      y={labelY + 13}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="pf-roadmap-mono"
                      style={{
                        fontSize: zoomCompFont(9),
                        fill: INK500,
                        opacity: fut ? 0.5 : 0.7,
                        pointerEvents: "none",
                      }}
                    >
                      {n.date}
                    </text>
                  </g>
                );
              })}

              {Object.keys(childCount).map((id) => {
                if (childCount[id] < 2) return null;
                const n = nodeMap[id];
                if (!n || hiddenLifeAreaIds.has(n.tree)) return null;
                const x = nx(n);
                const y = n.y;
                const col = getRoadmapLifeAreaColor(n.tree, isDark);
                const fy = y - 16;
                return (
                  <polygon
                    key={`fork-${id}`}
                    points={`${x},${fy - 6} ${x - 5},${fy + 2} ${x + 5},${fy + 2}`}
                    fill={col}
                    opacity={n.past ? 0.5 : 0.25}
                  />
                );
              })}

              <rect x={0} y={0} width={effectiveLayoutWidth} height={50} fill="url(#rmTopFade)" />
              <rect
                x={0}
                y={ROADMAP_SVG_H - 22}
                width={effectiveLayoutWidth}
                height={22}
                fill="url(#rmBotFade)"
              />

              {branchLanes.map((lane) => {
                if (!lane.showLabel) return null;
                if (hiddenLifeAreaIds.has(lane.limbId)) return null;
                const col = getRoadmapLifeAreaColor(lane.limbId, isDark);
                const anchor = branchLabelAnchors.get(lane.branchId);
                const short =
                  lane.label.length > 24 ? `${lane.label.slice(0, 23)}…` : lane.label;
                return (
                  <text
                    key={`bl-${lane.branchId}`}
                    x={anchor?.x ?? lane.x}
                    y={anchor?.y ?? ROADMAP_NOW_Y + 14}
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-pf-roadmap-mono), ui-monospace, monospace",
                      fontSize: zoomCompFont(10.5),
                      fontWeight: lane.isChild ? 550 : 650,
                      fill: col,
                      opacity: lane.isChild ? 0.88 : 0.98,
                      letterSpacing: "0.01em",
                      stroke: isDark ? "#141618" : "#FAF8F2",
                      strokeWidth: zoomCompFont(2.2),
                      paintOrder: "stroke fill",
                      pointerEvents: "none",
                    }}
                  >
                    {short}
                  </text>
                );
              })}
                </svg>
              </div>
            </div>
          </div>

          {hover ? (
            <RoadmapHoverCard
              node={hover.node}
              trees={trees}
              isDark={isDark}
              mainRef={mainRef}
              left={hover.left}
              top={hover.top}
            />
          ) : null}
        </main>
      </div>

      {!useMockData ? (
        <CreateMarkModal
          open={addMarkOpen}
          onClose={() => setAddMarkOpen(false)}
          branches={branches as unknown as ApiBranchRow[]}
          defaultLifeAreaId={addMarkDefaultLifeArea}
          onCreated={async () => {
            setAddMarkOpen(false);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function RoadmapHoverCard({
  node,
  trees,
  isDark,
  mainRef,
  left,
  top,
}: {
  node: RoadmapNode;
  trees: ReturnType<typeof roadmapTreeMeta>;
  isDark: boolean;
  mainRef: React.RefObject<HTMLElement | null>;
  left: number;
  top: number;
}) {
  const col = getRoadmapLifeAreaColor(node.tree, isDark);
  const meta = trees[node.tree];
  const eyebrow = `${meta?.label ?? node.tree}${node.past ? "" : " · goal"}`;

  const [mainBounds, setMainBounds] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) {
      setMainBounds(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setMainBounds({ width: r.width, height: r.height });
  }, [mainRef, left, top, node.id]);

  const cw = 220;
  const ch = 100;
  let cardLeft = left + 16;
  let cardTop = top - ch / 2;
  if (mainBounds) {
    cardLeft = left > mainBounds.width * 0.6 ? Math.max(4, left - cw - 16) : left + 16;
    cardTop = Math.min(Math.max(top - ch / 2, 52), mainBounds.height - ch - 8);
  }

  return (
    <div
      className="rm-hover-card rm-show"
      style={{
        borderLeft: `3px solid ${col}`,
        left: cardLeft,
        top: cardTop,
      }}
    >
      <div className="rm-hc-eyebrow" style={{ color: col }}>
        {eyebrow}
      </div>
      <div className="rm-hc-title">{node.label}</div>
      <div className="rm-hc-date">{node.date}</div>
      <div className="rm-hc-body">{node.note || "—"}</div>
    </div>
  );
}
