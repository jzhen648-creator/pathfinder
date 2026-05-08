"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  AREA_LABEL_CONFIG,
  TREE_TRUNK_FILL_PATH,
  TREE_TRUNK_MIRROR_X,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from "./tree-geometry";
import type { AreaBranchData, Point, TreeGoalNode } from "./tree-types";
import {
  BRANCH_LAYOUT_BEND_SAMPLE_TS,
  branchDefaultBendHandlePoints,
  branchPointAtUniformFraction,
  buildStraightForksRecord,
  closestGlobalTOnLimb,
  getAreaSlotRender,
  limbPathBetweenGlobalT,
  limbPointAtUniformFraction,
  limbStrokeEndPoint,
} from "./tree-forks";
import {
  applyLayoutOverrides,
  getDefaultLayoutOverrides,
  loadLayoutOverrides,
  parseLayoutOverridesFromJson,
  saveLayoutOverrides,
  type AreaLayoutOverride,
  type BranchLayoutOverride,
} from "./tree-layout-edit";
import { TreeElementGuideTag } from "./tree-element-guide-tag";
import { TreeRenderStatsHud } from "./tree-render-stats-hud";
import { renderGoalsSubtree } from "./tree-render-goals-subtree";
import {
  arcLengthMomentStationSegment,
  buildRenderedBranchMainPath,
  branchGuideStationTs,
  getOpacity,
  goalTAlongThread,
  momentCatalogClipGlobalT,
  momentPositionAtArcOffsetFromStationLo,
  pathPointAtT,
  pickThreadMomentsForTree,
  resolvedChainMomentPos,
} from "./tree-branch-geometry";
import { clientToWorldSvg } from "./tree-view-coords";
import {
  hasAreaOverride,
  hasCrossedLayoutDragThreshold,
  upsertAreaLayout,
} from "./tree-view-layout-overrides";
import {
  nodeRadius,
  TREE_LAYOUT_EDIT_ENABLED,
  TREE_LAYOUT_SCALE_ORIGIN_Y,
  TREE_LAYOUT_WORLD_SCALE,
  TREE_MOMENT_DEV_LABELS_ENABLED,
  TREE_RENDER_STATS_ENABLED,
  TREE_THREAD_VISIBLE_MOMENTS,
} from "./tree-view-constants";
import type { LayoutPointerDrag, TreeSVGProps } from "./tree-view-types";

export function TreeSVG({
  areas,
  allAreasForForkGeometry = areas,
  focused,
  panel,
  onClear,
  onAreaClick,
  onAddGoalPlaceholderClick,
  onMomentClick,
  onGoalClick,
  onFoundationsClick,
  exportRootRef,
  showElementGuide = false,
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
  const straightForkBases = useMemo(
    () => buildStraightForksRecord(allAreasForForkGeometry),
    [allAreasForForkGeometry],
  );
  const resolvedForks = useMemo(
    () => applyLayoutOverrides(straightForkBases, layoutOverrides),
    [layoutOverrides, straightForkBases],
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
  const [bloomPlayingIds, setBloomPlayingIds] = useState<Set<string>>(() => new Set());
  const prevGoalBloomRef = useRef<Map<string, TreeGoalNode["bloomStatus"]>>(new Map());

  useEffect(() => {
    const current = new Map<string, TreeGoalNode["bloomStatus"]>();
    const walk = (g: TreeGoalNode) => {
      current.set(g.id, g.bloomStatus);
      g.childGoals.forEach(walk);
    };
    areas.forEach((a) => a.branches.forEach((t) => t.goals.forEach(walk)));
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
      return upsertAreaLayout(prev, areaId, area);
    });
  };

  const patchThreadLayout = (areaId: string, threadIdx: number, patch: Partial<BranchLayoutOverride>) => {
    setLayoutOverrides((prev) => {
      const area = { ...(prev[areaId] ?? {}) } as AreaLayoutOverride;
      const threads = { ...(area.branches ?? {}) };
      threads[threadIdx] = { ...(threads[threadIdx] ?? {}), ...patch };
      area.branches = threads;
      return upsertAreaLayout(prev, areaId, area);
    });
  };

  const patchThreadBendAt = (areaId: string, threadIdx: number, bendIndex: number, pt: Point) => {
    setLayoutOverrides((prev) => {
      const mergedForks = applyLayoutOverrides(buildStraightForksRecord(allAreasForForkGeometry), prev);
      const baseThread = mergedForks[areaId]?.branches[threadIdx];
      if (!baseThread) return prev;
      const area = { ...(prev[areaId] ?? {}) } as AreaLayoutOverride;
      const threads = { ...(area.branches ?? {}) };
      const cur = { ...(threads[threadIdx] ?? {}) } as BranchLayoutOverride;
      const defaults = BRANCH_LAYOUT_BEND_SAMPLE_TS.map((t) => branchPointAtUniformFraction(baseThread, t));
      let bends: Point[];
      if (cur.bendPoints?.length === BRANCH_LAYOUT_BEND_SAMPLE_TS.length)
        bends = cur.bendPoints.map((p) => ({ ...p }));
      else bends = defaults.map((p) => ({ ...p }));
      const idx = Math.max(0, Math.min(BRANCH_LAYOUT_BEND_SAMPLE_TS.length - 1, bendIndex));
      bends[idx] = pt;
      const nextCur = { ...cur };
      delete nextCur.bendPoint;
      nextCur.bendPoints = bends;
      threads[threadIdx] = nextCur;
      area.branches = threads;
      return upsertAreaLayout(prev, areaId, area);
    });
  };

  const patchMomentLayout = (areaId: string, momentId: string, pt: Point | null) => {
    setLayoutOverrides((prev) => {
      const sourceArea = areas.find((a) => a.id === areaId);
      const sourceThreadIdx = sourceArea?.branches.findIndex((t) => t.moments.some((m) => m.id === momentId)) ?? -1;
      const sourceMomentIdx =
        sourceThreadIdx >= 0
          ? (sourceArea?.branches[sourceThreadIdx]?.moments.findIndex((m) => m.id === momentId) ?? -1)
          : -1;
      const sourceThread = sourceThreadIdx >= 0 ? sourceArea?.branches[sourceThreadIdx] : undefined;
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

      const next = { ...prev };
      upsertMomentPosition(next, areaId, momentId, pt);

      return next;
    });
  };

  const releaseLayoutPointer = (e: PointerEvent<SVGCircleElement>) => {
    const d = layoutDragRef.current;
    if (d?.pointerId === e.pointerId) {
      if (d.kind === "threadFork") {
        const areaData = areas.find((a) => a.id === d.areaId);
        const ids = areaData?.branches[d.threadIdx]?.moments.map((m) => m.id) ?? [];
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
          <filter id="tree-add-goal-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          <g
            transform={`translate(${TREE_TRUNK_MIRROR_X}, ${TREE_LAYOUT_SCALE_ORIGIN_Y}) scale(${TREE_LAYOUT_WORLD_SCALE}) translate(${-TREE_TRUNK_MIRROR_X}, ${-TREE_LAYOUT_SCALE_ORIGIN_Y})`}
          >
          {/* Tapered trunk: ground → single crown fork (no stroke continuing up into Becoming). */}
          <path d={TREE_TRUNK_FILL_PATH} fill="url(#trunkBodyGrad)" />

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
          {showElementGuide ? (
            <g data-tree-export-skip="1" pointerEvents="none">
              <TreeElementGuideTag x={600} y={1402} text="foundations" />
            </g>
          ) : null}

          {areas.map((area) => {
            const slots = getAreaSlotRender(area.id, resolvedForks);
            if (!slots) return null;
            const cfg = AREA_LABEL_CONFIG[area.id];
            const forkSpec = resolvedForks[area.id];
            const branchForkTs =
              forkSpec != null
                ? area.branches.map((_, bi) => {
                    const br = forkSpec.branches[bi];
                    return br ? closestGlobalTOnLimb(forkSpec, br.forkPoint) : 0;
                  })
                : [];
            const sortedBranchIdx = area.branches
              .map((_, i) => i)
              .sort((a, b) => branchForkTs[a]! - branchForkTs[b]!);

            type BranchLayoutRow = {
              thread: AreaBranchData;
              idx: number;
              threadSlot: { path: string; strokeWidth: number };
              threadOpacity: number;
              threadForTree: AreaBranchData;
              threadMainDraw: string;
              threadCatalogFull: string;
              nextGoalSlotT: number;
              /** Catalog t at chord end for default moment placement (matches stroke tip / placeholder cap). */
              momentChordTEnd: number;
              placeholderPt: Point;
            };

            const branchLayoutRows: BranchLayoutRow[] = [];
            for (let idx = 0; idx < area.branches.length; idx += 1) {
              const thread = area.branches[idx]!;
              const threadSlot = slots.branchStrokes[idx];
              if (!threadSlot) continue;
              const threadOpacity = focused === area.id ? 0.88 : 0.85;
              const threadSpec = forkSpec?.branches[idx];
              const treeMoments = pickThreadMomentsForTree(thread.moments, TREE_THREAD_VISIBLE_MOMENTS);
              const threadForTree: AreaBranchData = { ...thread, moments: treeMoments };
              const {
                strokePath: threadMainDraw,
                catalogFullPath: threadCatalogFull,
                nextGoalSlotT,
                momentChordTEnd,
              } = buildRenderedBranchMainPath(
                area.id,
                idx,
                threadForTree,
                threadSlot.path,
                threadSpec,
                layoutOverrides[area.id],
              );
              const placeholderPt = pathPointAtT(threadCatalogFull, nextGoalSlotT);
              branchLayoutRows.push({
                thread,
                idx,
                threadSlot,
                threadOpacity,
                threadForTree,
                threadMainDraw,
                threadCatalogFull,
                nextGoalSlotT,
                momentChordTEnd,
                placeholderPt,
              });
            }

            /** Life-area title sits at the stem base (crown junction), not out by the add-goal placeholder. */
            const areaLabelAnchor: Point = forkSpec
              ? forkSpec.trunkAttach
              : pathPointAtT(slots.limb, 0);

            return (
              <g
                key={area.id}
                style={{
                  opacity: getOpacity(focused, area.id),
                  transition: "opacity 300ms ease",
                }}
              >
                {/* Full stem kept for hit-target only; visible stem is drawn per-thread so it doesn’t extend past other forks. */}
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

                {branchLayoutRows.map((row) => {
                  const {
                    thread,
                    idx,
                    threadSlot,
                    threadOpacity,
                    threadForTree,
                    threadMainDraw,
                    threadCatalogFull,
                    nextGoalSlotT,
                    momentChordTEnd,
                  } = row;
                  const branchStations = branchGuideStationTs(thread, nextGoalSlotT);
                  const threadGuideNearFork = pathPointAtT(threadMainDraw, 0.07);
                  const momentCount = Math.max(1, threadForTree.moments.length);
                  const goalsOnThread = thread.goals;

                  const kFork = sortedBranchIdx.indexOf(idx);
                  const limbSegT0 = kFork <= 0 ? 0 : branchForkTs[sortedBranchIdx[kFork - 1]!]!;
                  const limbSegT1 = branchForkTs[idx] ?? 0;
                  const limbSegPath =
                    forkSpec != null && limbSegT1 > limbSegT0 + 1e-9
                      ? limbPathBetweenGlobalT(forkSpec, limbSegT0, limbSegT1)
                      : "";

                  return (
                    <g key={thread.id}>
                      {limbSegPath ? (
                        <>
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={slots.limbStrokeWidth * 2.2}
                            strokeLinecap="butt"
                            opacity={0.18}
                            pointerEvents="none"
                          />
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={slots.limbStrokeWidth * 1.3}
                            strokeLinecap="butt"
                            opacity={0.55}
                            pointerEvents="none"
                          />
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={slots.limbStrokeWidth * 0.45}
                            strokeLinecap="butt"
                            opacity={0.95}
                            pointerEvents="none"
                          />
                        </>
                      ) : null}
                      {showElementGuide && limbSegPath ? (
                        <g data-tree-export-skip="1" pointerEvents="none">
                          <TreeElementGuideTag
                            x={pathPointAtT(limbSegPath, 0.5).x}
                            y={pathPointAtT(limbSegPath, 0.5).y - 6}
                            text={`stem-seg · ${area.id} · ${idx}`}
                          />
                        </g>
                      ) : null}
                      <path
                        d={threadMainDraw}
                        fill="none"
                        stroke={area.color}
                        strokeWidth={threadSlot.strokeWidth}
                        strokeLinecap="butt"
                        opacity={threadOpacity}
                        pointerEvents="none"
                      />
                      {showElementGuide ? (
                        <g data-tree-export-skip="1" pointerEvents="none">
                          <TreeElementGuideTag
                            x={threadGuideNearFork.x}
                            y={threadGuideNearFork.y - 15}
                            text={`thread · ${idx} · ${thread.type}`}
                          />
                          {branchStations.length >= 2
                            ? branchStations.slice(0, -1).map((ta, si) => {
                                const tb = branchStations[si + 1]!;
                                if (tb - ta < 0.004) return null;
                                const tm = (ta + tb) / 2;
                                const p = pathPointAtT(threadCatalogFull, tm);
                                return (
                                  <TreeElementGuideTag
                                    key={`${thread.id}-bseg-${si}`}
                                    x={p.x}
                                    y={p.y + (si % 2 === 0 ? 11 : -10)}
                                    text={`branch-seg · ${idx} · ${si}`}
                                  />
                                );
                              })
                            : null}
                        </g>
                      ) : null}
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
                              const childPath = `M${splitPos.x},${splitPos.y} L${childPos.x},${childPos.y}`;
                              const midFork = {
                                x: (splitPos.x + childPos.x) / 2,
                                y: (splitPos.y + childPos.y) / 2,
                              };
                              return (
                                <g key={`${thread.id}-sib-${sib.id}`}>
                                  <path d={childPath} fill="none" stroke={area.color} strokeWidth={thread.postSplitStrokeWidth ?? Math.max(1.2, threadSlot.strokeWidth * 0.7)} opacity={0.8} strokeLinecap="round" pointerEvents="none" />
                                  <circle cx={childPos.x} cy={childPos.y} r={3.2} fill={area.color} opacity={0.92} pointerEvents="none" />
                                  {showElementGuide ? (
                                    <g data-tree-export-skip="1" pointerEvents="none">
                                      <TreeElementGuideTag
                                        x={midFork.x}
                                        y={midFork.y + (sibIdx % 2 === 0 ? 9 : -9)}
                                        text={`branch-fork-seg · ${idx} · ${sibIdx}`}
                                      />
                                    </g>
                                  ) : null}
                                </g>
                              );
                            })}
                          </g>
                        );
                      })() : null}

                      {goalsOnThread.length > 0
                        ? goalsOnThread.map((g, gi) => {
                            const t = goalTAlongThread(g, gi, thread.goals.length);
                            const pos = pathPointAtT(threadCatalogFull, t);
                            return (
                              <g key={g.id}>
                                {renderGoalsSubtree(
                                  g,
                                  pos,
                                  area,
                                  area.color,
                                  panel,
                                  showAllGoalMilestonesByZoom,
                                  bloomPlayingIds,
                                  onGoalClick,
                                  panMoved,
                                  0,
                                  showElementGuide,
                                )}
                              </g>
                            );
                          })
                        : null}

                      {showMarksByZoom
                        ? threadForTree.moments.map((moment, momentIdx) => {
                        const isSelected = selectedMomentId === moment.id;
                        const isGrowing = moment.bloomStatus === "GROWING" || moment.future;
                        const isEnded = moment.bloomStatus === "ENDED";
                        const isFlower = moment.isTurningPoint && moment.bloomStatus === "BLOOMED";
                        const r = nodeRadius(moment.significance);

                        const pos = resolvedChainMomentPos(
                          area.id,
                          idx,
                          threadForTree,
                          momentIdx,
                          threadCatalogFull,
                          layoutOverrides[area.id]?.momentPositions,
                          momentChordTEnd,
                        );
                        const miLo = Math.max(0, momentIdx - 1);
                        const miHi = Math.min(momentCount - 1, momentIdx + 1);
                        const pBefore = resolvedChainMomentPos(
                          area.id,
                          idx,
                          threadForTree,
                          miLo,
                          threadCatalogFull,
                          layoutOverrides[area.id]?.momentPositions,
                          momentChordTEnd,
                        );
                        const pAfter = resolvedChainMomentPos(
                          area.id,
                          idx,
                          threadForTree,
                          miHi,
                          threadCatalogFull,
                          layoutOverrides[area.id]?.momentPositions,
                          momentChordTEnd,
                        );
                        let dx = pAfter.x - pBefore.x;
                        let dy = pAfter.y - pBefore.y;
                        if (dx * dx + dy * dy < 1e-12) {
                          const tc = Math.min(momentChordTEnd, momentCatalogClipGlobalT(threadSlot.path, momentCount));
                          const q0 = pathPointAtT(threadCatalogFull, Math.max(0, tc - 0.06));
                          const q1 = pathPointAtT(threadCatalogFull, Math.min(momentChordTEnd, tc + 0.06));
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
                            {showElementGuide && momentIdx === 0 ? (
                              <g data-tree-export-skip="1" pointerEvents="none">
                                <TreeElementGuideTag x={pos.x} y={pos.y + r + 14} text="timeline-moment" />
                              </g>
                            ) : null}
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
                                  <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={r + 4}
                                    fill="none"
                                    stroke={area.color}
                                    strokeWidth={1.2}
                                    opacity={0.4}
                                    className="pulse-ring"
                                  />
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

                      {(() => {
                        const tip = row.placeholderPt;
                        const hitR = 16;
                        return (
                          <g>
                            <title>Add goal</title>
                            {showElementGuide ? (
                              <g data-tree-export-skip="1" pointerEvents="none">
                                <TreeElementGuideTag x={tip.x} y={tip.y + 20} text="add-goal" />
                              </g>
                            ) : null}
                            <circle
                              cx={tip.x}
                              cy={tip.y}
                              r={11}
                              fill={area.color}
                              className="tree-add-goal-placeholder-glow"
                              opacity={0.4}
                              pointerEvents="none"
                              filter="url(#tree-add-goal-glow)"
                            />
                            <circle
                              cx={tip.x}
                              cy={tip.y}
                              r={4.2}
                              fill={area.color}
                              fillOpacity={0.92}
                              stroke="#F5F0E6"
                              strokeWidth={0.85}
                              strokeOpacity={0.55}
                              pointerEvents="none"
                            />
                            <circle
                              cx={tip.x}
                              cy={tip.y}
                              r={hitR}
                              fill="transparent"
                              style={{ cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (panMoved.current) return;
                                onAddGoalPlaceholderClick(thread.id);
                              }}
                            />
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}

                <text
                  x={areaLabelAnchor.x + cfg.dx}
                  y={areaLabelAnchor.y + cfg.dy}
                  textAnchor={cfg.anchor}
                  fontSize={12}
                  fontWeight={600}
                  letterSpacing=".03em"
                  fill={area.color}
                  fillOpacity={0.98}
                  stroke="#0A0908"
                  strokeWidth={3.2}
                  strokeLinejoin="round"
                  paintOrder="stroke fill"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (panMoved.current) return;
                    onAreaClick(area);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {area.label}
                </text>
                {showElementGuide ? (
                  <g data-tree-export-skip="1" pointerEvents="none">
                    <TreeElementGuideTag
                      x={areaLabelAnchor.x + cfg.dx}
                      y={areaLabelAnchor.y + cfg.dy - 11}
                      text={`life-area · ${area.id}`}
                      anchor={cfg.anchor}
                    />
                  </g>
                ) : null}
              </g>
            );
          })}
          {showElementGuide ? (
            <g data-tree-export-skip="1" pointerEvents="none">
              <rect
                x={118}
                y={258}
                width={200}
                height={144}
                rx={6}
                fill="rgba(8,6,10,0.9)"
                stroke="#57534E"
                strokeWidth={0.5}
              />
              <text x={128} y={278} fill="#E7E5E4" fontSize={8.5} fontFamily="ui-monospace, monospace" fontWeight={600}>
                Tree map (use in chat)
              </text>
              <text x={128} y={294} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                life-area · title + id
              </text>
              <text x={128} y={306} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                stem-seg · trunk→fork piece
              </text>
              <text x={128} y={318} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                thread · index + type (whole branch)
              </text>
              <text x={128} y={330} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                branch-seg · fork→goal→bud pieces
              </text>
              <text x={128} y={342} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                branch-fork-seg · sibling sprout
              </text>
              <text x={128} y={354} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                add-goal · placeholder bud
              </text>
              <text x={128} y={366} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                roadmap-goal · plan node
              </text>
              <text x={128} y={378} fill="#A8A29E" fontSize={7} fontFamily="ui-monospace, monospace">
                timeline-moment · zoom to see
              </text>
              <text x={128} y={392} fill="#78716C" fontSize={6.5} fontFamily="ui-monospace, monospace">
                PDF export hides these tags
              </text>
            </g>
          ) : null}
          {process.env.NODE_ENV === "development" ? (
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
                    {spec.branches.map((th, ti) => (
                      <g key={`debug-geom-${area.id}-th-${ti}`}>
                        <circle cx={th.forkPoint.x} cy={th.forkPoint.y} r={3} fill={area.color} opacity={0.92} />
                        <circle cx={th.tip.x} cy={th.tip.y} r={2} fill={area.color} opacity={0.85} />
                      </g>
                    ))}
                    {area.branches.map((thread) => (
                      <g key={`debug-spine-${area.id}-${thread.id}`}>
                        <circle cx={thread.p1.x} cy={thread.p1.y} r={4.4} fill="#FBBF24" opacity={0.95} />
                        <circle cx={thread.p2.x} cy={thread.p2.y} r={4.4} fill="#F472B6" opacity={0.95} />
                      </g>
                    ))}
                  </g>
                );
              })}
            </g>
          ) : null}
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
                const threadNodes = fs.branches.flatMap((th, ti) => {
                  const pivot = th.forkPoint;
                  const rx = pivot.x + 22 + ti * 2;
                  const ry = pivot.y - 14 - ti * 2;
                  const bendPtsRaw = layoutOverrides[area.id]?.branches?.[ti]?.bendPoints;
                  const bendPts =
                    bendPtsRaw?.length === BRANCH_LAYOUT_BEND_SAMPLE_TS.length
                      ? bendPtsRaw
                      : branchDefaultBendHandlePoints(th);
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
                          const baseRotateDeg = layoutOverrides[area.id]?.branches?.[ti]?.rotateDeg ?? 0;
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
                    const mergedForks = applyLayoutOverrides(buildStraightForksRecord(allAreasForForkGeometry), prev);
                    let maxMoments = 0;
                    let shortestArc = Infinity;
                    for (const area of areas) {
                      const slots = getAreaSlotRender(area.id, mergedForks);
                      if (!slots) continue;
                      for (let ti = 0; ti < area.branches.length; ti += 1) {
                        const thread = area.branches[ti];
                        const n = thread.moments.length;
                        maxMoments = Math.max(maxMoments, n);
                        if (n < 2) continue;
                        const path = slots.branchStrokes[ti]?.path;
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
                      for (let ti = 0; ti < area.branches.length; ti += 1) {
                        const thread = area.branches[ti];
                        const path = slots.branchStrokes[ti]?.path;
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
                Turn on <strong style={{ color: "#E7E5E4", fontWeight: 600 }}>Edit layout</strong> per limb below to show handles on the tree (teal bends, yellow fork, purple rotate, cyan goals). Drag those handles or set limb rotation ° for that limb. Overrides auto-save locally; use import/export between sessions.
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
                            return upsertAreaLayout(prev, a.id, cur);
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
                    const mp = { ...(areaPrev.momentPositions ?? {}) };
                    for (const th of ar.branches) {
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