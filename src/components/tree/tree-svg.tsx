"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  lifeAreaTrunkForkLabelLayout,
  limbIconCenterNearLifeAreaLabel,
  limbLabelDecorHullCorners,
  themeGatewayClusterHitBounds,
  TREE_TRUNK_MIRROR_X,
  TREE_TRUNK_PRESSURE_LAYERS,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from "./tree-geometry";
import {
  deriveSimplifiedTrunkCenterVeinD,
  deriveSimplifiedTrunkSilhouetteD,
  deriveTrunkCenterlineX,
  deriveTrunkCrownForkPaths,
  deriveTrunkJunctionWarmthSpec,
  TRUNK_BASE_Y,
  TRUNK_CROWN_Y,
} from "./tree-trunk-geometry";
import type { AreaData, DomainHubData, Point, TreeGoalNode } from "./tree-types";
import {
  areaForkStemFirstC2,
  BRANCH_LAYOUT_BEND_SAMPLE_TS,
  branchDefaultBendHandlePoints,
  branchMainPathUntilGlobalT,
  branchPointAtUniformFraction,
  buildAreaForksRecord,
  buildPreviewAreaForksRecord,
  closestGlobalTOnLimb,
  compareBranchIndicesForStemOrder,
  connectiveBowPathD,
  getAreaSlotRender,
  isHubGatewayLayout,
  limbPathBetweenGlobalT,
  limbPointAtUniformFraction,
  limbStrokeEndPoint,
} from "./tree-forks";
import {
  applyLayoutOverrides,
  loadLayoutEditActive,
  loadLayoutOverrides,
  saveLayoutEditActive,
  saveLayoutOverrides,
  type AreaLayoutOverride,
  type BranchLayoutOverride,
} from "./tree-layout-edit";
import { TreeLayoutDevPanel } from "./tree-layout-dev-panel";
import { TreeElementGuideTag } from "./tree-element-guide-tag";
import { TreeRenderStatsHud } from "./tree-render-stats-hud";
import { TreeMarkNode } from "./tree-mark-node";
import { TREE_THEME_CANVAS_SERIF, TREE_THEME_SHORT_LABEL } from "./tree-design-visual";
import { renderGoalsSubtree } from "./tree-render-goals-subtree";
import { getTreeRenderQualityFactors } from "./tree-render-quality";
import {
  arcLengthMomentStationSegment,
  buildRenderedBranchMainPath,
  branchGuideStationTs,
  domainClusterBranchOutwardFromCatalog,
  domainClusterGatewaySpreadNormalForForkSpec,
  domainClusterGatewayHubPathD,
  domainClusterFlowSegmentPathD,
  domainClusterGoalFlowSegments,
  domainClusterGoalRingGoalCount,
  domainClusterGoalRingSlotIndex,
  domainClusterHubPointFromCatalog,
  type DomainClusterMomentChainContext,
  themeGatewayPointForArea,
  getOpacity,
  goalHexRotationRadFromTangentOut,
  goalMarkerTangentOutForPlacement,
  goalScreenPositionForLifeAreaThread,
  momentPositionAtArcOffsetFromStationLo,
  pathPointAtT,
  pathTangentAtT,
  polylinePathApproxBetweenT,
  pickThreadMomentsForTree,
  resolvedChainMomentPos,
} from "./tree-branch-geometry";
import {
  flattenGoalsById,
  goalPursuitDepth,
  pursuitConnectorStrokeWidth,
} from "./tree-connector-strokes";
import { shouldDomainClusterThread } from "./tree-renderer-grammar";
import { clientToWorldSvg, storedTreePointToClientSvg } from "./tree-view-coords";
import { animateTreePan, panTransformToCenterComposePoint } from "./tree-pan-animate";
import { computeTreeFitTransformFromLayout, resolveHubCenterInComposeViewport } from "./tree-view-fit";
import { goalInSubtree, threadContainsGoal } from "./tree-view-goal-queries";
import {
  hasAreaOverride,
  hasCrossedLayoutDragThreshold,
  upsertAreaLayout,
} from "./tree-view-layout-overrides";
import {
  limbBackdropSurfaceTint,
  TRUNK_WARM_BASE_HEX,
  TRUNK_WARM_CROWN_HEX,
  TRUNK_WARM_MID_HEX,
  TRUNK_WARM_ROOT_HEX,
  TRUNK_WARM_VEIN_HEX,
  trunkJunctionTintHex,
} from "./tree-color-accents";
import {
  TREE_CINEMATIC_VFX,
  TREE_CINEMATIC_VFX_ENABLED,
  cinematicBlurStd,
  limbBackdropHullPolygonOpacity,
  limbBackdropVeilCenterOpacity,
  limbBackdropVeilFillOpacity,
  limbBackdropVeilMidOpacity,
  treeCinematicMinimalLimbHull,
} from "./tree-cinematic-vfx";
import {
  buildEcologicalCarryStreaks,
  buildEcologicalFilaments,
  ecologicalPocketVoidSkip,
  irregularStemSampleTs,
  pocketEllipseShapeJitter,
  pocketHullBleedEligible,
  type EcologicalPocketPoint,
} from "./tree-render-ecological-field";
import {
  getLimbDepthStaging,
  intraLimbBranchDepthMul,
  type LimbStagingContext,
} from "./tree-render-staging";
import {
  branchConduitPressureOpacityMul,
  branchIndexDepthRenderingMul,
  branchLongitudinalWidthSampleAvg01,
  branchMidRunConstrictionWidthMul,
  branchStrokeOpacityEnvelopeMul01,
  canopyOccupancyRhythmMaterialMul,
  conduitVitalityMaterialFactors,
  junctionMaterialAccumulation,
  milestoneClusterMaterialMul,
  stableRenderJitter01,
  svgDefSafeId,
  threadMomentSignificanceMul,
} from "./tree-render-materials";
import {
  computeHubGatewayBackdropHull,
  computeLifeAreaLimbFloatNudgesPx,
  computeLimbBackdropHull,
  LIMB_BACKDROP_HULL_BLEED_OPACITY_MAX,
  LIMB_BACKDROP_HULL_POCKET_OPACITY_MAX,
  limbBackdropPrincipalVeilEllipse,
} from "./tree-limb-backdrop-bounds";
import { hubTrunkFilamentSpecs } from "./tree-hub-trunk-filaments";
import {
  domainHubLabelFontScale,
  domainHubLabelOpacity,
  lifeAreaTitleOpacity,
  threadPathLabelOpacity,
  type LimbLabelContext,
} from "./tree-label-lod";
import { treeMapLimbHueReadableInk } from "./tree-canvas-label";
import { TreeSvgTextLabel } from "./tree-svg-text-label";
import {
  connectiveBowOriginForArea,
  domainHubLabelLayout,
  trunkLayoutEnabled,
} from "./tree-trunk-slots";
import {
  MARK_DIAMOND_HALF_PX,
  TREE_DEBUG_GEOM_ENABLED,
  TREE_LAYOUT_EDIT_ENABLED,
  TREE_LAYOUT_SCALE_ORIGIN_Y,
  TREE_LAYOUT_WORLD_SCALE,
  TREE_MAP_SURFACE_FILL,
  TREE_RENDER_STATS_ENABLED,
  TREE_THREAD_LABELS_ENABLED,
  TREE_THREAD_MARKER_VISUALS_ENABLED,
  TREE_THREAD_VISIBLE_MOMENTS,
  TREE_LIMB_ICON_SIZE_PX,
  TREE_THEME_GATEWAY_ICON_PX,
  TREE_DOMAIN_HUB_GLYPH_PX,
  TREE_DOMAIN_HUB_GLYPH_PX_TRUNK,
  TREE_DOMAIN_HUB_LABEL_FONT_PX,
  TREE_DOMAIN_HUB_LABEL_FONT_PX_TRUNK,
  TREE_DOMAIN_HUB_LABEL_GAP_PX,
  TREE_THREAD_PATH_LABEL_FONT_PX,
  TREE_LIFE_AREA_TITLE_FONT_PX,
  CONDUIT_THREAD_STROKE_SCALE,
  CONDUIT_LIMB_STEM_STROKE_SCALE,
  TREE_DOMAIN_GATEWAY_SPOKE_OPACITY,
  TREE_DOMAIN_GATEWAY_SPOKE_STROKE_PX,
  snapTreeSvgScalar,
} from "./tree-view-constants";
import { FLAGS } from "@/lib/flags";
import { DormantPulse, GhostPulse } from "./tree-node-pulse";
import {
  resolveThemeLayoutMode,
  useGatewayThemeLayout,
} from "./tree-theme-layout-mode";
import {
  deriveThemeVisualState,
  ghostHubSlotsForArea,
  type NodeVisualState,
} from "./tree-node-visual-state";
import { branchIconForHub, limbIconForLifeArea, normalizedLimbIconSize } from "@/components/icons";
import { TreeIconMedallion, iconMedallionRadii } from "./tree-icon-medallion";
import { TreeFocusPathPulse } from "./tree-focus-path-pulse";
import {
  LimbRevealGateway,
  LimbRevealHubNode,
  LimbRevealSpoke,
  LimbRevealStem,
} from "./tree-limb-reveal-animation";
import type { LifeAreaId } from "@/lib/types";
import { normalizeHubLabelKey } from "@/lib/taxonomy";
import { StreamPreviewMarkersLayer } from "@/components/stream/stream-preview-tree-layer";
import { TreeEditMapOverlay } from "./tree-edit-map-overlay";
import type { EditDragGoalPayload } from "./tree-edit-drag";
import type { LayoutPointerDrag, TreeSVGProps } from "./tree-view-types";

function domainClusterMomentChainCtx(
  areaId: string,
  row: {
    thread: DomainHubData;
    idx: number;
    threadCatalogFull: string;
    threadDomainCluster: boolean;
  },
  sortedBranchIdx: number[],
  dcGatewaySpreadNormal: Point | undefined,
  layoutOv: AreaLayoutOverride | undefined,
  layoutAnchors: { trunkAttach: Point; gateway: Point } | undefined,
): DomainClusterMomentChainContext | null {
  if (FLAGS.BRANCH_LONGITUDINAL_ALL || !row.threadDomainCluster) return null;
  return {
    catalogFullPath: row.threadCatalogFull,
    kFork: sortedBranchIdx.indexOf(row.idx),
    branchCountOnLimb: sortedBranchIdx.length,
    goalsOnThread: row.thread.goals,
    domainClusterGatewaySpreadNormal: dcGatewaySpreadNormal,
    layoutOv,
    layoutAnchors,
    branchId: row.thread.id,
  };
}

/** Trunk fan arc slot: taxonomy order for Becoming; stem sort order (`kFork`) for other themes. */
function trunkHubFanSlotIndex(
  areaId: string,
  branchIdx: number,
  sortedBranchIdx: number[],
): number {
  if (areaId === "becoming") return branchIdx;
  return sortedBranchIdx.indexOf(branchIdx);
}

function TreeSVGInner({
  areas,
  previewAreas,
  allAreasForForkGeometry = areas,
  focused,
  focusedLimbId,
  onToggleLimbFocus,
  panel,
  onClear,
  onAreaClick,
  onHubClick,
  activeMarkId = null,
  onMarkPointerEnter,
  onMarkPointerLeave,
  onMarkClick,
  onGoalClick,
  exportRootRef,
  showElementGuide = false,
  suppressDevUi = false,
  streamPanFocus = null,
  initialFitAreaIds,
  initialFitPaddingPx,
  initialFitIncludePreviewBranchTips = false,
  highlightGoalId = null,
  streamPanelWidthPx = 0,
  editMapMode = false,
  editMapDraftAreas = null,
  onEditMapDraftDrop,
  dormantLimbIds = [],
  unlockedLimbIds = [],
  activatingLimbId = null,
  limbRevealLimbId = null,
  onLimbRevealComplete,
  onboardingHubPickMode,
  previewGatewayLayout = false,
  onCameraFrame,
}: TreeSVGProps) {
  const selectedMomentId = activeMarkId;
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!limbRevealLimbId || !FLAGS.TREE_THEME_ACTIVATION_ANIM) return;
    const id = limbRevealLimbId;
    const t = window.setTimeout(() => onLimbRevealComplete?.(id), 950);
    return () => window.clearTimeout(t);
  }, [limbRevealLimbId, onLimbRevealComplete]);
  const layoutDragRef = useRef<LayoutPointerDrag | null>(null);
  const renderMarksRef = useRef<number[]>([]);
  /** Per-limb toggles: SVG handles + limb ° input only where enabled. */
  const [layoutEditByAreaId, setLayoutEditByAreaId] = useState<Record<string, boolean>>(loadLayoutEditActive);
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

  const setAllLayoutEdit = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setLayoutEditByAreaId({});
        return;
      }
      setLayoutEditByAreaId(Object.fromEntries(areas.map((a) => [a.id, true])));
    },
    [areas],
  );

  const [layoutDevPanelCollapsed, setLayoutDevPanelCollapsed] = useState(true);
  const [layoutOverrides, setLayoutOverrides] = useState(loadLayoutOverrides);
  const forkBases = useMemo(() => buildAreaForksRecord(allAreasForForkGeometry), [allAreasForForkGeometry]);
  const resolvedForks = useMemo(
    () => applyLayoutOverrides(forkBases, layoutOverrides),
    [layoutOverrides, forkBases],
  );
  const previewForkBases = useMemo(() => buildPreviewAreaForksRecord(), []);
  const previewForks = useMemo(
    () => applyLayoutOverrides(previewForkBases, layoutOverrides),
    [previewForkBases, layoutOverrides],
  );
  const gatewayPreviewOpts = useMemo(
    () => ({ forceGatewayPreview: previewGatewayLayout || onboardingHubPickMode != null }),
    [previewGatewayLayout, onboardingHubPickMode],
  );
  const renderForks = useMemo(() => {
    const merged = { ...resolvedForks };
    for (const area of allAreasForForkGeometry) {
      const mode = resolveThemeLayoutMode(area, unlockedLimbIds, gatewayPreviewOpts);
      if (mode === "gateway-preview" && previewForks[area.id]) {
        merged[area.id] = previewForks[area.id];
      }
    }
    return merged;
  }, [allAreasForForkGeometry, gatewayPreviewOpts, previewForks, resolvedForks, unlockedLimbIds]);
  useEffect(() => {
    saveLayoutOverrides(layoutOverrides);
  }, [layoutOverrides]);

  useEffect(() => {
    saveLayoutEditActive(layoutEditByAreaId);
  }, [layoutEditByAreaId]);

  useEffect(() => {
    if (!TREE_LAYOUT_EDIT_ENABLED) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "l" && e.key !== "L") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        return;
      }
      e.preventDefault();
      setLayoutDevPanelCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!TREE_RENDER_STATS_ENABLED || typeof performance === "undefined") return;
    renderMarksRef.current.push(performance.now());
  });

  const initialPanScale = VIEWBOX_WIDTH / 1200;
  const baselineZoomScale = 0.88 * initialPanScale;
  const [transform, setTransform] = useState({
    x: VIEWBOX_WIDTH / 2 - baselineZoomScale * (VIEWBOX_WIDTH * 0.5),
    y: VIEWBOX_HEIGHT / 2 - baselineZoomScale * (VIEWBOX_HEIGHT * 0.42),
    scale: baselineZoomScale,
  });
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  const streamPanAnimCancelRef = useRef<(() => void) | null>(null);
  const fitPanAnimCancelRef = useRef<(() => void) | null>(null);
  const didInitialFitRef = useRef(false);
  const lastFitTargetKeyRef = useRef<string | null>(null);
  const onCameraFrameRef = useRef(onCameraFrame);
  useEffect(() => {
    onCameraFrameRef.current = onCameraFrame;
  }, [onCameraFrame]);
  const zoomRatio = transform.scale / baselineZoomScale;
  const treeRenderQuality = getTreeRenderQualityFactors();
  /** Limb backdrop & goals always account for hex orbitals when milestones exist (no zoom gate). */
  const goalOrbitalsAlwaysVisibleForLayout = true;
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
      if (prev !== undefined && prev !== "COMPLETE" && status === "COMPLETE") newly.add(id);
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
  const pendingPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const panRafRef = useRef<number | null>(null);
  const panMovedRef = useRef(false);
  const notifyPanMoved = useCallback(() => {
    panMovedRef.current = true;
  }, []);
  const shouldSuppressMapClick = useCallback(() => panMovedRef.current, []);
  const beginGoalDragRef = useRef<
    ((payload: EditDragGoalPayload, clientX: number, clientY: number, originX: number, originY: number) => void) | null
  >(null);
  const [editLayoutAreas, setEditLayoutAreas] = useState<AreaData[] | null>(null);
  const [editDraggedGoalId, setEditDraggedGoalId] = useState<string | null>(null);
  const editLayoutLiftRef = useRef<{ preview: AreaData[] | null; draggedGoalId: string | null }>({
    preview: null,
    draggedGoalId: null,
  });
  const layoutAreas = editLayoutAreas ?? editMapDraftAreas ?? areas;

  const handleEditLayoutPreviewChange = useCallback((preview: AreaData[] | null, draggedGoalId: string | null) => {
    const prev = editLayoutLiftRef.current;
    if (prev.preview === preview && prev.draggedGoalId === draggedGoalId) return;
    editLayoutLiftRef.current = { preview, draggedGoalId };
    setEditLayoutAreas(preview);
    setEditDraggedGoalId(draggedGoalId);
  }, []);

  useEffect(() => {
    if (!editMapMode) {
      editLayoutLiftRef.current = { preview: null, draggedGoalId: null };
      setEditLayoutAreas(null);
      setEditDraggedGoalId(null);
    }
  }, [editMapMode]);

  const handleEditGoalPointerDown = useCallback(
    (goal: TreeGoalNode, area: AreaData, e: PointerEvent, originX: number, originY: number) => {
      beginGoalDragRef.current?.(
        {
          goalId: goal.id,
          areaId: area.id,
          branchId: goal.branchId,
          parentGoalId: goal.parentGoalId,
          areaColor: area.color,
          title: goal.title,
        },
        e.clientX,
        e.clientY,
        originX,
        originY,
      );
    },
    [],
  );

  const flushPanUpdate = useCallback(() => {
    panRafRef.current = null;
    const next = pendingPanPointRef.current;
    pendingPanPointRef.current = null;
    if (!next || !lastPan.current) return;

    const dx = next.x - lastPan.current.x;
    const dy = next.y - lastPan.current.y;
    lastPan.current = next;

    if (panStart.current) {
      const totalDx = next.x - panStart.current.x;
      const totalDy = next.y - panStart.current.y;
      if (Math.hypot(totalDx, totalDy) > 5) panMovedRef.current = true;
    }

    if (dx === 0 && dy === 0) return;
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const cancelPanFrame = useCallback(
    (flush = false) => {
      if (panRafRef.current != null) {
        window.cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      if (flush) flushPanUpdate();
      else pendingPanPointRef.current = null;
    },
    [flushPanUpdate],
  );

  useEffect(() => () => cancelPanFrame(false), [cancelPanFrame]);

  const beginPan = (x: number, y: number) => {
    if (editMapMode) return;
    cancelPanFrame(false);
    window.getSelection()?.removeAllRanges();
    setIsPanning(true);
    panMovedRef.current = false;
    lastPan.current = { x, y };
    panStart.current = { x, y };
  };

  const updatePan = (x: number, y: number) => {
    if (!lastPan.current) return;
    pendingPanPointRef.current = { x, y };
    if (panRafRef.current == null) {
      panRafRef.current = window.requestAnimationFrame(flushPanUpdate);
    }
  };

  const endPan = () => {
    cancelPanFrame(true);
    setIsPanning(false);
    lastPan.current = null;
    panStart.current = null;
    pendingPanPointRef.current = null;
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

  const patchHubLayout = (areaId: string, branchId: string, pt: Point) => {
    setLayoutOverrides((prev) => {
      const area = { ...(prev[areaId] ?? {}) } as AreaLayoutOverride;
      const hubPositions = { ...(area.hubPositions ?? {}) };
      hubPositions[branchId] = pt;
      area.hubPositions = hubPositions;
      return upsertAreaLayout(prev, areaId, area);
    });
  };

  const patchThreadBendAt = (areaId: string, threadIdx: number, bendIndex: number, pt: Point) => {
    setLayoutOverrides((prev) => {
      const mergedForks = applyLayoutOverrides(buildAreaForksRecord(allAreasForForkGeometry), prev);
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

  /** Render-only vertical flow read off public centerline — not silhouette edits. */
  const trunkVascularFlowPaths = useMemo(() => {
    if (!FLAGS.TREE_TRUNK_VISIBLE || trunkLayoutEnabled()) {
      return { left: "", mid: "", right: "" };
    }
    const n = 28;
    const yTop = TRUNK_CROWN_Y + 26;
    const yBot = TRUNK_BASE_Y - 92;
    const span = yBot - yTop;
    const mk = (dx: number, phase: number) => {
      let d = "";
      for (let i = 0; i < n; i += 1) {
        const u = i / (n - 1);
        const y = yTop + u * span;
        const cx = deriveTrunkCenterlineX(y);
        const rib =
          1.05 * Math.sin(u * Math.PI * 6.6 + phase) +
          0.42 * Math.sin(u * Math.PI * 12.5 + phase * 1.6);
        const x = cx + dx + rib * (Math.abs(dx) < 0.05 ? 1.35 : 0.32);
        d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
      }
      return d;
    };
    return { left: mk(-4.4, 0.15), mid: mk(0, 1.05), right: mk(4.4, 2.35) };
  }, []);

  const limbStagingCtx: LimbStagingContext = useMemo(
    () => ({
      focusedAreaId: focused,
      focusLimbMode: FLAGS.FOCUS_MODE,
      focusedLimbId,
    }),
    [focused, focusedLimbId],
  );

  const areasRenderOrder = useMemo(
    () =>
      [...layoutAreas].sort(
        (a, b) =>
          getLimbDepthStaging(a.id, limbStagingCtx).sortKey - getLimbDepthStaging(b.id, limbStagingCtx).sortKey,
      ),
    [layoutAreas, limbStagingCtx],
  );

  const simplifiedTrunkArt = useMemo(() => {
    if (!trunkLayoutEnabled()) return null;
    return {
      silhouetteD: deriveSimplifiedTrunkSilhouetteD(),
      veinD: deriveSimplifiedTrunkCenterVeinD(),
      crownForks: deriveTrunkCrownForkPaths(),
      junctions: areasRenderOrder
        .map((area) => {
          const attach = resolvedForks[area.id]?.trunkAttach;
          if (!attach) return null;
          return {
            areaId: area.id,
            ...deriveTrunkJunctionWarmthSpec(area.id, attach),
          };
        })
        .filter((j): j is NonNullable<typeof j> => j != null),
    };
  }, [areasRenderOrder, resolvedForks]);

  /** Gentle hub repulsion so life-area wedges behave like separate floats—close but not stacked. */
  const lifeAreaFloatNudgePx = useMemo(() => {
    if (trunkLayoutEnabled()) {
      return Object.fromEntries(areasRenderOrder.map((id) => [id, { x: 0, y: 0 }]));
    }
    return computeLifeAreaLimbFloatNudgesPx(
      areasRenderOrder.map((a) => a.id),
      (id) => {
        const spec = renderForks[id];
        if (!spec) return null;
        return isHubGatewayLayout(spec) ? spec.limbTip : spec.trunkAttach;
      },
    );
  }, [areasRenderOrder, renderForks]);

  const treeFitTransform = useMemo(
    () =>
      computeTreeFitTransformFromLayout({
        areas,
        forks: renderForks,
        floatNudges: lifeAreaFloatNudgePx,
        layoutOverrides,
        viewWidth: VIEWBOX_WIDTH,
        viewHeight: VIEWBOX_HEIGHT,
        fallback: {
          x: VIEWBOX_WIDTH / 2 - baselineZoomScale * (VIEWBOX_WIDTH * 0.5),
          y: VIEWBOX_HEIGHT / 2 - baselineZoomScale * (VIEWBOX_HEIGHT * 0.42),
          scale: baselineZoomScale,
        },
      }),
    [areas, renderForks, lifeAreaFloatNudgePx, layoutOverrides, baselineZoomScale],
  );

  const focusLimbInView = useCallback(
    (areaId: string) => {
      setTransform(
        computeTreeFitTransformFromLayout({
          areas,
          forks: renderForks,
          floatNudges: lifeAreaFloatNudgePx,
          layoutOverrides,
          viewWidth: VIEWBOX_WIDTH,
          viewHeight: VIEWBOX_HEIGHT,
          areaIds: [areaId],
          fallback: transformRef.current,
        }),
      );
      toggleAreaLayoutEdit(areaId, true);
      setLayoutDevPanelCollapsed(false);
    },
    [areas, renderForks, lifeAreaFloatNudgePx, layoutOverrides, toggleAreaLayoutEdit, setTransform, setLayoutDevPanelCollapsed],
  );

  const fitAreaIdsKey =
    initialFitAreaIds && initialFitAreaIds.length > 0 ? initialFitAreaIds.join(",") : "__full__";

  const targetFitTransform = useMemo(
    () =>
      initialFitAreaIds && initialFitAreaIds.length > 0
        ? computeTreeFitTransformFromLayout({
            areas,
            forks: renderForks,
            floatNudges: lifeAreaFloatNudgePx,
            layoutOverrides,
            viewWidth: VIEWBOX_WIDTH,
            viewHeight: VIEWBOX_HEIGHT,
            areaIds: initialFitAreaIds,
            paddingPx: initialFitPaddingPx,
            includePreviewBranchTips: initialFitIncludePreviewBranchTips,
            fallback: treeFitTransform,
          })
        : treeFitTransform,
    [
      areas,
      renderForks,
      lifeAreaFloatNudgePx,
      layoutOverrides,
      treeFitTransform,
      initialFitAreaIds,
      initialFitPaddingPx,
      initialFitIncludePreviewBranchTips,
    ],
  );

  const targetFitKey = useMemo(() => {
    const t = targetFitTransform;
    return `${fitAreaIdsKey}|${t.x.toFixed(1)}|${t.y.toFixed(1)}|${t.scale.toFixed(4)}`;
  }, [targetFitTransform, fitAreaIdsKey]);

  const reportCameraFrame = useCallback(() => {
    const cb = onCameraFrameRef.current;
    if (!cb) return;
    const svg = svgRef.current;
    if (!svg) return;
    const cw = svg.clientWidth;
    const ch = svg.clientHeight;
    if (cw < 40 || ch < 40) return;
    cb({
      svg,
      transform: transformRef.current,
      viewWidth,
      viewHeight,
    });
  }, [viewWidth, viewHeight]);

  useEffect(() => {
    if (areas.length === 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    const applyFit = () => {
      const cw = svg.clientWidth;
      const ch = svg.clientHeight;
      if (cw < 40 || ch < 40) return;

      if (lastFitTargetKeyRef.current === targetFitKey) return;

      const t = targetFitTransform;
      const cur = transformRef.current;
      const alreadyThere =
        didInitialFitRef.current &&
        Math.abs(cur.x - t.x) < 2 &&
        Math.abs(cur.y - t.y) < 2 &&
        Math.abs(cur.scale - t.scale) < 0.002;

      if (!didInitialFitRef.current) {
        setTransform(targetFitTransform);
        didInitialFitRef.current = true;
        lastFitTargetKeyRef.current = targetFitKey;
        reportCameraFrame();
        return;
      }

      if (alreadyThere) {
        lastFitTargetKeyRef.current = targetFitKey;
        reportCameraFrame();
        return;
      }

      const from = transformRef.current;
      fitPanAnimCancelRef.current?.();
      fitPanAnimCancelRef.current = animateTreePan(
        from,
        targetFitTransform,
        setTransform,
        420,
        () => {
          lastFitTargetKeyRef.current = targetFitKey;
          reportCameraFrame();
        },
      );
    };

    applyFit();
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(svg);
    return () => {
      ro.disconnect();
      fitPanAnimCancelRef.current?.();
      fitPanAnimCancelRef.current = null;
    };
  }, [targetFitKey, targetFitTransform, areas.length, setTransform, reportCameraFrame]);

  useEffect(() => {
    if (!onCameraFrame) return;
    reportCameraFrame();
    window.addEventListener("resize", reportCameraFrame);
    return () => window.removeEventListener("resize", reportCameraFrame);
  }, [onCameraFrame, reportCameraFrame]);

  useEffect(() => {
    if (!streamPanFocus) return;
    const hubCenter = resolveHubCenterInComposeViewport({
      areas: allAreasForForkGeometry,
      forks: resolvedForks,
      layoutOverrides,
      areaId: streamPanFocus.areaId,
      branchId: streamPanFocus.branchId,
    });
    if (!hubCenter) return;

    const svg = svgRef.current;
    const clientW = svg?.clientWidth ?? VIEWBOX_WIDTH;
    const panelW = Math.min(streamPanelWidthPx, clientW * 0.85);
    const visibleCenterX = ((clientW - panelW) / 2 / Math.max(clientW, 1)) * viewWidth;

    const from = transformRef.current;
    const pan = panTransformToCenterComposePoint({
      target: hubCenter,
      viewWidth,
      viewHeight,
      scale: from.scale,
      visibleCenterX,
    });
    const to = { ...from, ...pan };

    streamPanAnimCancelRef.current?.();
    streamPanAnimCancelRef.current = animateTreePan(from, to, setTransform);
    return () => {
      streamPanAnimCancelRef.current?.();
      streamPanAnimCancelRef.current = null;
    };
  }, [
    streamPanFocus?.key,
    streamPanFocus?.areaId,
    streamPanFocus?.branchId,
    allAreasForForkGeometry,
    resolvedForks,
    layoutOverrides,
    streamPanelWidthPx,
    viewWidth,
    viewHeight,
  ]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "block",
        position: "relative",
        background: TREE_MAP_SURFACE_FILL,
      }}
    >
      {TREE_RENDER_STATS_ENABLED && !suppressDevUi ? <TreeRenderStatsHud marksRef={renderMarksRef} /> : null}
      <div
        ref={exportRootRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width="100%"
        height="100%"
        style={{
          background: TREE_MAP_SURFACE_FILL,
          cursor: onboardingHubPickMode
            ? "default"
            : editMapMode
              ? "grab"
              : anyLayoutEditActive && TREE_LAYOUT_EDIT_ENABLED
                ? "default"
                : isPanning
                  ? "grabbing"
                  : "grab",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onWheel={(e) => {
          if (onboardingHubPickMode) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const delta = e.deltaY > 0 ? 0.86 : 1.163;
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
          if (onboardingHubPickMode) return;
          if (editMapMode) return;
          if (anyLayoutEditActive && TREE_LAYOUT_EDIT_ENABLED && isLayoutEditHandleTarget(e.target)) return;
          if (e.button !== 0) return;
          e.preventDefault();
          beginPan(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          if (!isPanning || !lastPan.current) return;
          updatePan(e.clientX, e.clientY);
        }}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onTouchStart={(e) => {
          if (onboardingHubPickMode) return;
          if (editMapMode) return;
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
          if (onboardingHubPickMode) return;
          if (shouldSuppressMapClick()) return;
          onClear();
        }}
      >
        <defs>
          {FLAGS.TREE_TRUNK_VISIBLE && !trunkLayoutEnabled() ? (
            <>
              {/* Vascular trunk: compressed luminous core, absorbed silhouette edge — matches bloom material logic. */}
              <linearGradient
                id="trunkInnerVeinGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor="#0C0A0C" stopOpacity={1} />
                <stop offset="38%" stopColor="#7a6c62" stopOpacity={0.22} />
                <stop offset="50%" stopColor="#e9e0d4" stopOpacity={0.36} />
                <stop offset="62%" stopColor="#7a6c62" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#0B090B" stopOpacity={1} />
              </linearGradient>
              <radialGradient
                id="trunkBodyGrad"
                cx="50%"
                cy="44%"
                r="78%"
                fx="50%"
                fy="38%"
                gradientUnits="objectBoundingBox"
                gradientTransform="translate(0.5 0.5) scale(0.92 1.02) translate(-0.5 -0.5)"
              >
                <stop offset="0%" stopColor="#ebe3da" stopOpacity={0.17} />
                <stop offset="18%" stopColor="#6a6058" stopOpacity={0.38} />
                <stop offset="34%" stopColor="#3a3430" stopOpacity={0.62} />
                <stop offset="48%" stopColor="#221e1c" stopOpacity={0.88} />
                <stop offset="62%" stopColor="#161412" stopOpacity={1} />
                <stop offset="100%" stopColor="#050408" stopOpacity={1} />
              </radialGradient>
              <radialGradient
                id="trunkOuterMassGrad"
                cx="50%"
                cy="52%"
                r="96%"
                fx="48%"
                fy="55%"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor="#121016" stopOpacity={0.08} />
                <stop offset="55%" stopColor="#08070a" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#020203" stopOpacity={0.92} />
              </radialGradient>
              <radialGradient
                id="trunkAtmosphericVeilGrad"
                cx="50%"
                cy="48%"
                r="85%"
                fx="50%"
                fy="42%"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor="#c4b8aa" stopOpacity={0.03} />
                <stop offset="40%" stopColor="#1c1816" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#050406" stopOpacity={0.14} />
              </radialGradient>
              <linearGradient id="trunkRootFlareGrad" x1="50%" y1="0%" x2="50%" y2="100%" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#141018" stopOpacity={0.55} />
                <stop offset="55%" stopColor="#09080c" stopOpacity={0.88} />
                <stop offset="100%" stopColor="#030305" stopOpacity={1} />
              </linearGradient>
            </>
          ) : null}
          {trunkLayoutEnabled() ? (
            <>
              <linearGradient
                id="trunkSimplifiedBodyGrad"
                x1="50%"
                y1="0%"
                x2="50%"
                y2="100%"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor={TRUNK_WARM_CROWN_HEX} stopOpacity={0.68} />
                <stop offset="42%" stopColor={TRUNK_WARM_MID_HEX} stopOpacity={0.88} />
                <stop offset="78%" stopColor={TRUNK_WARM_BASE_HEX} stopOpacity={0.94} />
                <stop offset="100%" stopColor={TRUNK_WARM_ROOT_HEX} stopOpacity={1} />
              </linearGradient>
              <linearGradient
                id="trunkSimplifiedVeinGrad"
                x1="0%"
                y1="50%"
                x2="100%"
                y2="50%"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor={TRUNK_WARM_MID_HEX} stopOpacity={0.08} />
                <stop offset="48%" stopColor={TRUNK_WARM_VEIN_HEX} stopOpacity={0.55} />
                <stop offset="100%" stopColor={TRUNK_WARM_MID_HEX} stopOpacity={0.08} />
              </linearGradient>
              {areasRenderOrder.map((area) => {
                const jId = svgDefSafeId(`trunkJunction-${area.id}`);
                const tint = trunkJunctionTintHex(area.color, 0.09);
                return (
                  <radialGradient
                    key={jId}
                    id={jId}
                    cx="50%"
                    cy="50%"
                    r="50%"
                    gradientUnits="objectBoundingBox"
                  >
                    <stop offset="0%" stopColor={tint} stopOpacity={0.28} />
                    <stop offset="72%" stopColor={tint} stopOpacity={0.06} />
                    <stop offset="100%" stopColor={tint} stopOpacity={0} />
                  </radialGradient>
                );
              })}
            </>
          ) : null}
          <radialGradient id="treeEcoHazeBlob" cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#6a6478" stopOpacity={0.045} />
            <stop offset="70%" stopColor="#12101a" stopOpacity={0.012} />
            <stop offset="100%" stopColor="#030305" stopOpacity={0} />
          </radialGradient>
          {/* Macro staging: vertical depth falloff (linear, not limb-local radial). */}
          <linearGradient id="treeStageBackdropFalloff" x1="38%" y1="0%" x2="62%" y2="100%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#000006" stopOpacity={0.26} />
            <stop offset="18%" stopColor="#020208" stopOpacity={0.11} />
            <stop offset="44%" stopColor="#020208" stopOpacity={0.015} />
            <stop offset="100%" stopColor="#010104" stopOpacity={0.16} />
          </linearGradient>
          {/* Lower-field weight — compresses visual mass toward the base (asymmetric staging). */}
          <linearGradient id="treeStageSouthWeight" x1="42%" y1="0%" x2="58%" y2="100%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#010102" stopOpacity={0} />
            <stop offset="45%" stopColor="#010102" stopOpacity={0} />
            <stop offset="100%" stopColor="#020208" stopOpacity={0.3} />
          </linearGradient>
          {/* Frame-edge vignette: biased off-center for directional flow toward crown / trunk. */}
          <radialGradient id="treeStageEdgeVignette" cx="58%" cy="30%" r="88%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#010102" stopOpacity={0} />
            <stop offset="42%" stopColor="#010102" stopOpacity={0} />
            <stop offset="78%" stopColor="#030308" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#010106" stopOpacity={0.56} />
          </radialGradient>
          {/* Soft underlay only: blurs so energy reads diffuse, not a second crisp spline. */}
          <filter
            id="treeBranchStrokeEnergyUnderlay"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(1.68, TREE_CINEMATIC_VFX.branchEnergyBlur)}
              result="energyBlur"
            />
          </filter>
          <filter
            id="treeEcoLowHaze"
            x="-8%"
            y="-8%"
            width="116%"
            height="116%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0078"
              numOctaves="2"
              seed="418"
              stitchTiles="stitch"
              result="ecoN"
            />
            <feColorMatrix
              in="ecoN"
              type="matrix"
              values="0.2 0 0 0 0  0 0.18 0 0 0  0 0 0.24 0 0  0 0 0 0.038 0"
              result="ecoC"
            />
            <feGaussianBlur
              in="ecoC"
              stdDeviation={cinematicBlurStd(20, 0.55)}
              result="ecoB"
            />
          </filter>
          {/* Merge distributed hull pockets into soft mass (no concentric ring generator). */}
          <filter
            id="treeLimbHullPocketSoften"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="7.4" />
          </filter>
          <filter
            id="treeLimbHullBleedSoften"
            x="-120%"
            y="-120%"
            width="340%"
            height="340%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="11.2" />
          </filter>
          <filter
            id="treeLimbHullFilamentSoften"
            x="-80%"
            y="-80%"
            width="260%"
            height="260%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="5.6" />
          </filter>
          <filter
            id="treeLimbHullCarrySoften"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="14.5" />
          </filter>
          {/* Per–life-area membrane: one soft mass behind hull pockets (heavy blur). */}
          <filter
            id="treeAreaVeilMass"
            x="-80%"
            y="-80%"
            width="260%"
            height="260%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(16, TREE_CINEMATIC_VFX.limbVeilMassBlur / 16)}
            />
          </filter>
          {/* Life-area gateway: soft outer aura + mid bloom + crisp glyph (no concentric rings — avoids conduit clash). */}
          <filter
            id="treeGatewayIconAura"
            x="-150%"
            y="-150%"
            width="400%"
            height="400%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(26, TREE_CINEMATIC_VFX.gatewayAuraBlurMul)}
              result="gwAuraOuter"
            />
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(14, TREE_CINEMATIC_VFX.gatewayAuraBlurMul)}
              result="gwAuraMid"
            />
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(6.5, TREE_CINEMATIC_VFX.gatewayAuraBlurMul)}
              result="gwAuraNear"
            />
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(2.2, TREE_CINEMATIC_VFX.gatewayAuraBlurMul)}
              result="gwAuraTight"
            />
            <feComponentTransfer in="gwAuraOuter" result="gwAuraOuterDim">
              <feFuncA type="linear" slope="0.38" intercept="0" />
            </feComponentTransfer>
            <feComponentTransfer in="gwAuraMid" result="gwAuraMidDim">
              <feFuncA type="linear" slope="0.55" intercept="0" />
            </feComponentTransfer>
            <feComponentTransfer in="gwAuraNear" result="gwAuraNearDim">
              <feFuncA type="linear" slope="0.72" intercept="0" />
            </feComponentTransfer>
            <feComponentTransfer in="gwAuraTight" result="gwAuraTightDim">
              <feFuncA type="linear" slope="0.88" intercept="0" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="gwAuraOuterDim" />
              <feMergeNode in="gwAuraMidDim" />
              <feMergeNode in="gwAuraNearDim" />
              <feMergeNode in="gwAuraTightDim" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Wide ambient halo for medallion discs — smooth falloff without a hard rim. */}
          <filter
            id="treeMedallionAmbientHalo"
            x="-180%"
            y="-180%"
            width="460%"
            height="460%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(28, TREE_CINEMATIC_VFX.medallionHaloBlurMul)}
              result="haloFar"
            />
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(14, TREE_CINEMATIC_VFX.medallionHaloBlurMul)}
              result="haloMid"
            />
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={cinematicBlurStd(5.5, TREE_CINEMATIC_VFX.medallionHaloBlurMul)}
              result="haloNear"
            />
            <feComponentTransfer in="haloFar" result="haloFarDim">
              <feFuncA type="linear" slope="0.42" intercept="0" />
            </feComponentTransfer>
            <feComponentTransfer in="haloMid" result="haloMidDim">
              <feFuncA type="linear" slope="0.58" intercept="0" />
            </feComponentTransfer>
            <feComponentTransfer in="haloNear" result="haloNearDim">
              <feFuncA type="linear" slope="0.75" intercept="0" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="haloFarDim" />
              <feMergeNode in="haloMidDim" />
              <feMergeNode in="haloNearDim" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g
          transform={`translate(${snapTreeSvgScalar(transform.x)}, ${snapTreeSvgScalar(transform.y)}) scale(${transform.scale})`}
          style={{
            filter: TREE_CINEMATIC_VFX_ENABLED ? undefined : "brightness(1.12)",
          }}
        >
          <g
            transform={`translate(-28,20) rotate(-1.35 ${TREE_TRUNK_MIRROR_X} ${TRUNK_CROWN_Y + (TRUNK_BASE_Y - TRUNK_CROWN_Y) * 0.4}) translate(${TREE_TRUNK_MIRROR_X}, ${TREE_LAYOUT_SCALE_ORIGIN_Y}) scale(${TREE_LAYOUT_WORLD_SCALE}) translate(${-TREE_TRUNK_MIRROR_X}, ${-TREE_LAYOUT_SCALE_ORIGIN_Y})`}
          >
          {trunkLayoutEnabled() && simplifiedTrunkArt ? (
            <g pointerEvents="none" aria-hidden data-tree-trunk-simplified="1">
              <path
                d={simplifiedTrunkArt.silhouetteD}
                fill="url(#trunkSimplifiedBodyGrad)"
                opacity={0.9}
              />
              <path
                d={simplifiedTrunkArt.veinD}
                fill="none"
                stroke="url(#trunkSimplifiedVeinGrad)"
                strokeWidth={1.15}
                strokeLinecap="round"
                opacity={0.44}
                vectorEffect="non-scaling-stroke"
              />
              {simplifiedTrunkArt.junctions.map((junction) => (
                <circle
                  key={`trunk-junction-${junction.areaId}`}
                  cx={junction.cx}
                  cy={junction.cy}
                  r={junction.r}
                  fill={`url(#${svgDefSafeId(`trunkJunction-${junction.areaId}`)})`}
                  fillOpacity={junction.opacity}
                />
              ))}
              {simplifiedTrunkArt.crownForks.map((fork, fi) => (
                <path
                  key={`trunk-crown-fork-${fi}`}
                  d={fork.d}
                  fill="none"
                  stroke={TRUNK_WARM_CROWN_HEX}
                  strokeWidth={fork.strokeWidth}
                  strokeOpacity={fork.strokeOpacity}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : null}
          {FLAGS.TREE_TRUNK_VISIBLE && !trunkLayoutEnabled() ? (
            <>
              {/* Vascular column: root flare → layered mass → luminous vein + restrained veil (anchor composition). */}
              <path
                d={TREE_TRUNK_PRESSURE_LAYERS.rootFlareD}
                fill="url(#trunkRootFlareGrad)"
                opacity={0.82}
              />
              <path d={TREE_TRUNK_PRESSURE_LAYERS.outerD} fill="url(#trunkOuterMassGrad)" opacity={0.58} />
              <path d={TREE_TRUNK_PRESSURE_LAYERS.bodyD} fill="url(#trunkBodyGrad)" />
              <g pointerEvents="none" aria-hidden data-tree-trunk-vascular-flow="1">
                <path
                  d={trunkVascularFlowPaths.left}
                  fill="none"
                  stroke="#a89888"
                  strokeWidth={1.05}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.052}
                />
                <path
                  d={trunkVascularFlowPaths.mid}
                  fill="none"
                  stroke="#c4b8aa"
                  strokeWidth={0.92}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.062}
                />
                <path
                  d={trunkVascularFlowPaths.right}
                  fill="none"
                  stroke="#8a7c72"
                  strokeWidth={1.05}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.046}
                />
              </g>
            </>
          ) : null}
          {/* Sparse low-frequency haze — render-only ecological cohesion; behind limbs/branches. */}
          <rect
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fill="#06050a"
            filter="url(#treeEcoLowHaze)"
            opacity={TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.atmosphereEcoHaze : 0.16}
            pointerEvents="none"
            aria-hidden
            data-tree-eco-atmosphere="1"
          />
          <g
            pointerEvents="none"
            aria-hidden
            data-tree-eco-drift="1"
            opacity={TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.atmosphereDrift : 0.5}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              additive="sum"
              values="0,0; 2.4,-1.2; -1.8,0.95; 0,0"
              keyTimes="0;0.36;0.74;1"
              dur="300s"
              repeatCount="indefinite"
            />
            <ellipse
              cx={viewWidth * 0.4}
              cy={viewHeight * 0.36}
              rx={viewWidth * 0.26}
              ry={viewHeight * 0.2}
              fill="url(#treeEcoHazeBlob)"
              transform={`rotate(-6 ${viewWidth * 0.4} ${viewHeight * 0.36})`}
            />
            <ellipse
              cx={viewWidth * 0.62}
              cy={viewHeight * 0.4}
              rx={viewWidth * 0.24}
              ry={viewHeight * 0.19}
              fill="url(#treeEcoHazeBlob)"
              transform={`rotate(5 ${viewWidth * 0.62} ${viewHeight * 0.4})`}
            />
            <ellipse
              cx={viewWidth * 0.5}
              cy={viewHeight * 0.54}
              rx={viewWidth * 0.32}
              ry={viewHeight * 0.16}
              fill="url(#treeEcoHazeBlob)"
              opacity={0.75}
            />
          </g>
          <rect
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fill="url(#treeStageBackdropFalloff)"
            opacity={TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.stageFalloff : 0.42}
            pointerEvents="none"
            aria-hidden
            data-tree-compose-backdrop="1"
          />
          <rect
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fill="url(#treeStageSouthWeight)"
            opacity={TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.stageSouth : 0.32}
            pointerEvents="none"
            aria-hidden
            data-tree-compose-south="1"
          />
          {/* Vein + luminous veil render after limb/branch strokes (see emergence blend group) so overlap reads as embedded emergence, not hard under-stack clipping. */}

          {/* Refs (pan, layout drag, svg) are read only inside pointer handlers in this subtree. */}
          {/* eslint-disable react-hooks/refs -- large composed SVG layer */}
          {areasRenderOrder.map((area) => {
            const dataForkSpec = resolvedForks[area.id];
            const layoutMode = resolveThemeLayoutMode(area, unlockedLimbIds, gatewayPreviewOpts);
            const renderForkSpec = renderForks[area.id] ?? dataForkSpec;
            const useGatewayLayout = useGatewayThemeLayout(layoutMode);
            const slots = getAreaSlotRender(area.id, renderForks);
            if (!slots) return null;
            const forkSpec = dataForkSpec;
            const branchForkTs =
              forkSpec != null
                ? area.branches.map((_, bi) => {
                    const br = forkSpec.branches[bi];
                    return br ? closestGlobalTOnLimb(forkSpec, br.forkPoint) : 0;
                  })
                : [];
            const sortedBranchIdx = area.branches
              .map((_, i) => i)
              .sort((a, b) =>
                forkSpec != null ? compareBranchIndicesForStemOrder(forkSpec, a, b) : a - b,
              );
            const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(forkSpec);
            const hubLayoutAnchors =
              renderForkSpec != null
                ? { trunkAttach: renderForkSpec.trunkAttach, gateway: renderForkSpec.limbTip }
                : undefined;

            const goalPanelPulseGoalId =
              FLAGS.FOCUS_MODE && panel.type === "goal" && panel.area.id === area.id
                ? panel.goal.id
                : FLAGS.FOCUS_MODE &&
                    highlightGoalId &&
                    focusedLimbId === area.id &&
                    area.branches.some((thread) => threadContainsGoal(thread.goals, highlightGoalId))
                  ? highlightGoalId
                  : null;
            const limbFocusPulseActive =
              FLAGS.FOCUS_MODE && (focusedLimbId === area.id || goalPanelPulseGoalId != null);
            const limbGroupOpacity = getOpacity(focused, area.id);
            const depthStage = getLimbDepthStaging(area.id, limbStagingCtx);
            const composedLimbOpacity = limbGroupOpacity * depthStage.groupOpacityMul;
            const limbLabelCtx: LimbLabelContext = {
              zoomRatio,
              limbFocused: FLAGS.FOCUS_MODE && focusedLimbId === area.id,
              limbDeemphasized:
                FLAGS.FOCUS_MODE && focusedLimbId != null && focusedLimbId !== area.id,
            };

            type BranchLayoutRow = {
              thread: DomainHubData;
              idx: number;
              threadSlot: { path: string; strokeWidth: number };
              threadLineOpacity: number;
              threadForTree: DomainHubData;
              threadMainDraw: string;
              threadCatalogFull: string;
              nextGoalSlotT: number;
              /** Catalog t at chord end for default moment placement (matches stroke tip). */
              momentChordTEnd: number;
              threadDomainCluster: boolean;
            };

            const branchLayoutRows: BranchLayoutRow[] = [];
            for (let idx = 0; idx < area.branches.length; idx += 1) {
              const thread = area.branches[idx]!;
              const threadSlot = slots.branchStrokes[idx];
              if (!threadSlot) continue;
              /** Branch/thread line only (was 0.85 / 0.88); nodes & glows stay full-strength elsewhere. */
              const threadLineOpacityBase = focused === area.id ? 0.34 : 0.318;
              const threadLineOpacity = threadLineOpacityBase * depthStage.branchStrokeOpacityMul;
              const threadSpec = forkSpec?.branches[idx];
              /** Synthetic timeline pads must not force the moment-thread fork geometry — People domain hubs need the short conduit path. */
              const momentsForTreeNav =
                shouldDomainClusterThread(area.id, thread)
                  ? thread.moments.filter((m) => m.synthetic !== true)
                  : thread.moments;
              const treeMoments = pickThreadMomentsForTree(momentsForTreeNav, TREE_THREAD_VISIBLE_MOMENTS);
              const threadForTree: DomainHubData = { ...thread, moments: treeMoments };
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
                trunkHubFanSlotIndex(area.id, idx, sortedBranchIdx),
                sortedBranchIdx.length,
                dcGatewaySpreadNormal,
                hubLayoutAnchors,
                thread.id,
              );
              const threadDomainCluster = shouldDomainClusterThread(area.id, thread);
              branchLayoutRows.push({
                thread,
                idx,
                threadSlot,
                threadLineOpacity,
                threadForTree,
                threadMainDraw,
                threadCatalogFull,
                nextGoalSlotT,
                momentChordTEnd,
                threadDomainCluster,
              });
            }

            /** Life-area title: trunk fork for dendrites; hub limbs anchor at the gateway (conduit node). */
            const areaLabelAnchor: Point = renderForkSpec
              ? useGatewayLayout
                ? renderForkSpec.limbTip
                : renderForkSpec.trunkAttach
              : pathPointAtT(slots.limb, 0);

            const lifeAreaLabel = lifeAreaTrunkForkLabelLayout(
              area.id,
              renderForkSpec?.trunkAttach ?? pathPointAtT(slots.limb, 0),
              useGatewayLayout && renderForkSpec
                ? { hubGatewayNode: renderForkSpec.limbTip }
                : undefined,
            );
            const limbLabelDecorHull = limbLabelDecorHullCorners(
              lifeAreaLabel,
              area.label,
              TREE_LIMB_ICON_SIZE_PX,
            );

            const hubGatewayLayout = useGatewayLayout && renderForkSpec != null;
            const areaLimbId = area.id as LifeAreaId;
            const isDormant = dormantLimbIds.includes(areaLimbId);
            const isUnlockedEmpty =
              unlockedLimbIds.includes(areaLimbId) && area.branches.length === 0;
            const isActivating = activatingLimbId === areaLimbId;
            const isRevealing = limbRevealLimbId === areaLimbId;
            const obHubPickActive = onboardingHubPickMode != null;
            const obHubPickTrackPhase =
              obHubPickActive && onboardingHubPickMode!.themeId != null;
            const obHubPickSelected =
              obHubPickTrackPhase && onboardingHubPickMode!.themeId === areaLimbId;
            const obHubPickPeer =
              obHubPickTrackPhase &&
              onboardingHubPickMode!.themeId !== areaLimbId &&
              isUnlockedEmpty;
            const revealActive = isRevealing && FLAGS.TREE_THEME_ACTIVATION_ANIM;
            const themeVisualState: NodeVisualState = FLAGS.TREE_LATENT_POTENTIAL
              ? deriveThemeVisualState(area, unlockedLimbIds)
              : "live";
            const themeDisplayLabel = TREE_THEME_SHORT_LABEL[areaLimbId] ?? area.label;

            const hubMomentCount = area.branches.reduce((s, br) => s + br.moments.length, 0);
            const hubGoalCount = area.branches.reduce((s, br) => s + br.goals.length, 0);
            const hubDensity = Math.min(
              1,
              branchLayoutRows.length * 0.14 + hubMomentCount * 0.042 + hubGoalCount * 0.018,
            );

            const limbBackdropHull = hubGatewayLayout
              ? computeHubGatewayBackdropHull({
                  areaId: area.id,
                  limbPath: slots.limb,
                  themeGateway: themeGatewayPointForArea(area.id, renderForkSpec, layoutOverrides[area.id]),
                  trunkAttach: renderForkSpec!.trunkAttach,
                  branchCount: sortedBranchIdx.length,
                  branches: branchLayoutRows.map((row) => ({
                    thread: row.thread,
                    idx: row.idx,
                    threadCatalogFull: row.threadCatalogFull,
                    kFork: sortedBranchIdx.indexOf(row.idx),
                  })),
                  gatewaySpreadNormal: dcGatewaySpreadNormal,
                  hubDensity,
                  layoutOverride: layoutOverrides[area.id],
                  layoutAnchors: hubLayoutAnchors,
                })
              : computeLimbBackdropHull({
              areaId: area.id,
              limbPath: slots.limb,
              limbStrokeWidth: slots.limbStrokeWidth,
              forkSpec,
              branchForkTs,
              sortedBranchIdx,
              branches: branchLayoutRows.map((row) => ({
                thread: row.thread,
                threadForTree: row.threadForTree,
                idx: row.idx,
                threadMainDraw: row.threadMainDraw,
                threadCatalogFull: row.threadCatalogFull,
                threadSlotStrokeWidth: row.threadSlot.strokeWidth,
                nextGoalSlotT: row.nextGoalSlotT,
                momentChordTEnd: row.momentChordTEnd,
                kFork: sortedBranchIdx.indexOf(row.idx),
                threadDomainCluster: row.threadDomainCluster,
              })),
              momentPositions: layoutOverrides[area.id]?.momentPositions,
              domainClusterGatewaySpreadNormal: dcGatewaySpreadNormal,
              layoutOverride: layoutOverrides[area.id],
              layoutAnchors: hubLayoutAnchors,
              showAllGoalMilestonesByZoom: goalOrbitalsAlwaysVisibleForLayout,
              goalHighlightId: panel.type === "goal" ? panel.goal.id : undefined,
              trunkExcludeCenter: areaLabelAnchor,
            });

            const hubStemPt = pathPointAtT(slots.limb, 0.32);

            const floatNudge = lifeAreaFloatNudgePx[area.id] ?? { x: 0, y: 0 };
            const floatTranslateCss =
              Math.abs(floatNudge.x) > 0.02 || Math.abs(floatNudge.y) > 0.02
                ? `translate(${floatNudge.x}px, ${floatNudge.y}px) `
                : "";
            const limbTransformOrigin = `${TREE_TRUNK_MIRROR_X}px ${TRUNK_CROWN_Y + (TRUNK_BASE_Y - TRUNK_CROWN_Y) * 0.38}px`;

            return (
              <Fragment key={area.id}>
              <DormantPulse active={themeVisualState === "dormant" && !isActivating}>
                <GhostPulse active={themeVisualState === "ghost" && !isActivating && !obHubPickActive}>
                  <g
                    data-tree-limb-depth-plane={depthStage.plane}
                    style={{
                      opacity: composedLimbOpacity,
                      transition: FLAGS.FOCUS_MODE ? "opacity 350ms ease" : "opacity 300ms ease",
                      filter: depthStage.limbVisualFilter,
                      ...(floatTranslateCss || depthStage.limbComposeTransform
                        ? {
                            transform: `${floatTranslateCss}${depthStage.limbComposeTransform ?? ""}`.trim(),
                            transformOrigin: limbTransformOrigin,
                          }
                        : {}),
                    }}
                  >
                {limbBackdropHull ? (
                  <g
                    data-tree-limb-area-veil="1"
                    pointerEvents="none"
                    aria-hidden
                    style={{ opacity: depthStage.hullMassPresenceMul * 0.92 }}
                  >
                    {(() => {
                      const veilClipId = svgDefSafeId(`veilClip-${area.id}`);
                      const veilGradId = svgDefSafeId(`veilGrad-${area.id}`);
                      const veil = limbBackdropPrincipalVeilEllipse(limbBackdropHull);
                      const veilTint = limbBackdropSurfaceTint(area.color);
                      const hullAttr = limbBackdropHull.pointsAttr;
                      return (
                        <>
                          <defs>
                            <clipPath id={veilClipId} clipPathUnits="userSpaceOnUse">
                              <polygon points={hullAttr} />
                            </clipPath>
                            <radialGradient
                              id={veilGradId}
                              gradientUnits="userSpaceOnUse"
                              cx={veil.cx}
                              cy={veil.cy}
                              r={Math.max(veil.rx, veil.ry) * 1.05}
                            >
                              <stop
                                offset="0%"
                                stopColor={veilTint}
                                stopOpacity={limbBackdropVeilCenterOpacity()}
                              />
                              <stop
                                offset="52%"
                                stopColor={veilTint}
                                stopOpacity={limbBackdropVeilMidOpacity()}
                              />
                              <stop
                                offset="100%"
                                stopColor={veilTint}
                                stopOpacity={0}
                              />
                            </radialGradient>
                          </defs>
                          <g clipPath={`url(#${veilClipId})`}>
                            <ellipse
                              cx={veil.cx}
                              cy={veil.cy}
                              rx={veil.rx}
                              ry={veil.ry}
                              transform={`rotate(${veil.rotDeg.toFixed(2)}, ${veil.cx}, ${veil.cy})`}
                              fill={`url(#${veilGradId})`}
                              fillOpacity={limbBackdropVeilFillOpacity()}
                              stroke="none"
                              filter="url(#treeAreaVeilMass)"
                            />
                          </g>
                        </>
                      );
                    })()}
                  </g>
                ) : null}
                {limbBackdropHull && treeCinematicMinimalLimbHull() ? (
                  <polygon
                    points={limbBackdropHull.pointsAttr}
                    fill={limbBackdropSurfaceTint(area.color)}
                    fillOpacity={limbBackdropHullPolygonOpacity()}
                    pointerEvents="none"
                    data-tree-limb-hull-minimal="1"
                    style={{ opacity: depthStage.hullMassPresenceMul * 0.5 }}
                  />
                ) : null}
                {limbBackdropHull && !treeCinematicMinimalLimbHull() ? (() => {
                  const hullSid = svgDefSafeId(`hull-${area.id}`);
                  const limbTint = limbBackdropSurfaceTint(area.color);
                  const pocketMul = 0.74 + hubDensity * 0.52;

                  type HullPocket = {
                    k: string;
                    cx: number;
                    cy: number;
                    rx: number;
                    ry: number;
                    rot: number;
                    op: number;
                    em01: number;
                  };
                  const pocketsRaw: HullPocket[] = [];

                  irregularStemSampleTs(area.id).forEach((t, si) => {
                    const p = pathPointAtT(slots.limb, t);
                    const w = stableRenderJitter01(`${area.id}:stem:${si}`);
                    const wy = stableRenderJitter01(`${area.id}:stemy:${si}`);
                    const em01 = Math.max(0.12, 1 - t * 0.72);
                    pocketsRaw.push({
                      k: `stem-${area.id}-${si}`,
                      cx: p.x + (w - 0.5) * 14,
                      cy: p.y + (wy - 0.5) * 11,
                      rx: 16 + w * 31,
                      ry: 10 + wy * 23,
                      rot: -32 + w * 64,
                      op: (0.0105 + hubDensity * 0.016) * pocketMul * (0.85 + em01 * 0.2),
                      em01,
                    });
                  });

                  if (forkSpec) {
                    const a = forkSpec.trunkAttach;
                    const w = stableRenderJitter01(`${area.id}:attach`);
                    pocketsRaw.push({
                      k: `attach-${area.id}`,
                      cx: a.x + (w - 0.5) * 9,
                      cy: a.y - 5 + w * 6,
                      rx: 21 + w * 18,
                      ry: 14 + w * 13,
                      rot: 4 + w * 22,
                      op: 0.0205 * pocketMul,
                      em01: 0.96,
                    });
                    if (stableRenderJitter01(`${area.id}:knot`) > 0.48) {
                      const w2 = stableRenderJitter01(`${area.id}:knot2`);
                      pocketsRaw.push({
                        k: `knot-${area.id}-a`,
                        cx: a.x + (w2 - 0.5) * 16,
                        cy: a.y + 8 + w2 * 10,
                        rx: 11 + w2 * 14,
                        ry: 9 + w2 * 11,
                        rot: w2 * 50,
                        op: 0.024 * pocketMul,
                        em01: 0.98,
                      });
                    }
                    if (stableRenderJitter01(`${area.id}:knotb`) > 0.62) {
                      const w3 = stableRenderJitter01(`${area.id}:knot3`);
                      pocketsRaw.push({
                        k: `knot-${area.id}-b`,
                        cx: a.x - 10 + w3 * 20,
                        cy: a.y - 2 + w3 * 8,
                        rx: 9 + w3 * 12,
                        ry: 8 + w3 * 10,
                        rot: -20 + w3 * 40,
                        op: 0.017 * pocketMul,
                        em01: 0.9,
                      });
                    }
                  }

                  if (hubDensity > 0.055) {
                    const hubCount = stableRenderJitter01(`${area.id}:hubct`) > 0.52 ? 5 : 3;
                    const baseAng = stableRenderJitter01(`${area.id}:hubbase`) * Math.PI * 2;
                    for (let i = 0; i < hubCount; i += 1) {
                      const w = stableRenderJitter01(`${area.id}:hub${i}`);
                      const ang =
                        baseAng +
                        (i / hubCount) * Math.PI * 1.85 +
                        (w - 0.5) * 0.55 +
                        stableRenderJitter01(`${area.id}:hubang${i}`) * 0.35;
                      const rad = 10 + hubDensity * (18 + w * 22);
                      pocketsRaw.push({
                        k: `hub-${area.id}-${i}`,
                        cx: hubStemPt.x + Math.cos(ang) * rad,
                        cy: hubStemPt.y + Math.sin(ang) * (rad * 0.72),
                        rx: 13 + w * 24,
                        ry: 9 + w * 17,
                        rot: w * 78 - 40,
                        op: (0.011 + hubDensity * 0.017) * (0.72 + i * 0.07 + w * 0.12),
                        em01: 0.88,
                      });
                    }
                  }

                  for (const row of branchLayoutRows) {
                    const kFork = sortedBranchIdx.indexOf(row.idx);
                    const sig = threadMomentSignificanceMul(row.thread);
                    const dens =
                      pocketMul *
                      (0.86 + 0.055 * sig + 0.011 * row.thread.goals.length + 0.007 * row.thread.moments.length);

                    let tt = 0.048 + stableRenderJitter01(`${row.thread.id}:seg0`) * 0.05;
                    let segIdx = 0;
                    while (tt < 0.93 && segIdx < 7) {
                      const tag = `s${segIdx}`;
                      const pt = pathPointAtT(row.threadMainDraw, tt);
                      const w = stableRenderJitter01(`${row.thread.id}:${tag}x`);
                      const wy = stableRenderJitter01(`${row.thread.id}:${tag}y`);
                      const em01 = Math.max(0.1, 1 - tt * 0.92);
                      const tipFade = tt > 0.82 ? 0.68 : 1;
                      const skipMid =
                        segIdx === 2 && stableRenderJitter01(`${row.thread.id}:skipmid`) > 0.58;
                      if (!skipMid) {
                        pocketsRaw.push({
                          k: `${row.thread.id}-${tag}-${tt.toFixed(3)}`,
                          cx: pt.x + (w - 0.5) * 13,
                          cy: pt.y + (wy - 0.5) * 11,
                          rx: 11 + w * 24 * (0.75 + sig * 0.28),
                          ry: 8 + w * 17,
                          rot: -38 + w * 74,
                          op:
                            (0.0065 + 0.0095 * em01 + 0.002 * sig) *
                            dens *
                            tipFade *
                            (segIdx === 0 ? 1.12 : 1),
                          em01,
                        });
                      }
                      tt += 0.11 + stableRenderJitter01(`${row.thread.id}:segstep${segIdx}`) * 0.2;
                      segIdx += 1;
                    }

                    const br = forkSpec?.branches[row.idx];
                    if (br && kFork > 0) {
                      const w = stableRenderJitter01(`${row.thread.id}:fork`);
                      pocketsRaw.push({
                        k: `${row.thread.id}-fork`,
                        cx: br.forkPoint.x + (w - 0.5) * 8,
                        cy: br.forkPoint.y + (stableRenderJitter01(`${row.thread.id}:forky`) - 0.5) * 8,
                        rx: 14 + w * 16,
                        ry: 10 + w * 11,
                        rot: w * 42,
                        op: 0.0145 * dens * (0.85 + sig * 0.2),
                        em01: 0.78,
                      });
                    }

                    const tm = pickThreadMomentsForTree(row.thread.moments, TREE_THREAD_VISIBLE_MOMENTS);
                    const momentLayout = layoutOverrides[area.id]?.momentPositions;
                    const pocketDcChain = domainClusterMomentChainCtx(
                      area.id,
                      row,
                      sortedBranchIdx,
                      dcGatewaySpreadNormal,
                      layoutOverrides[area.id],
                      hubLayoutAnchors,
                    );
                    tm.forEach((moment, momentIdx) => {
                      if (stableRenderJitter01(`${moment.id}:voidms`) > 0.78) return;
                      const pos = resolvedChainMomentPos(
                        area.id,
                        row.idx,
                        { ...row.thread, moments: tm },
                        momentIdx,
                        row.threadCatalogFull,
                        momentLayout,
                        row.momentChordTEnd,
                        row.threadMainDraw,
                        pocketDcChain,
                      );
                      const w = stableRenderJitter01(`${moment.id}:ms`);
                      pocketsRaw.push({
                        k: `${moment.id}-ms`,
                        cx: pos.x + (w - 0.5) * 7,
                        cy: pos.y + (stableRenderJitter01(`${moment.id}:msy`) - 0.5) * 7,
                        rx: 8 + w * 14,
                        ry: 6 + w * 11,
                        rot: w * 48,
                        op: 0.0074 * dens * (0.88 + 0.038 * Math.min(5, moment.significance)),
                        em01: 0.52 + Math.min(5, moment.significance) * 0.04,
                      });
                    });
                  }

                  const pockets = pocketsRaw
                    .filter((pk) => !ecologicalPocketVoidSkip(pk.k, pk.em01))
                    .slice(0, 62);

                  const filamentPts: EcologicalPocketPoint[] = pockets.map((pk) => ({
                    cx: pk.cx,
                    cy: pk.cy,
                    op: pk.op,
                    k: pk.k,
                    emergence01: pk.em01,
                  }));
                  const filaments = buildEcologicalFilaments(filamentPts, area.id, 13);

                  const attachPt = forkSpec?.trunkAttach ?? hubStemPt;
                  const carryStreaks = buildEcologicalCarryStreaks({
                    areaId: area.id,
                    attachX: attachPt.x,
                    attachY: attachPt.y,
                    driftX: hubStemPt.x - attachPt.x + (stableRenderJitter01(`${area.id}:cdx`) - 0.5) * 28,
                    driftY: hubStemPt.y - attachPt.y + (stableRenderJitter01(`${area.id}:cdy`) - 0.5) * 22,
                    hubDensity,
                  });

                  return (
                    <g
                      data-tree-limb-hull-volume="1"
                      pointerEvents="none"
                      style={{ opacity: depthStage.hullMassPresenceMul }}
                    >
                      <defs>
                        <clipPath id={`limbHullClip-${hullSid}`}>
                          <polygon points={limbBackdropHull.pointsAttr} />
                        </clipPath>
                      </defs>
                      <g pointerEvents="none" data-tree-limb-hull-bleed="1" aria-hidden>
                        {pockets.map((pk) => {
                          if (!pocketHullBleedEligible(pk.k, pk.em01)) return null;
                          const ej = pocketEllipseShapeJitter(`${pk.k}:bleed`);
                          return (
                            <ellipse
                              key={`${pk.k}::bleed`}
                              cx={pk.cx + ej.dcx * 0.4}
                              cy={pk.cy + ej.dcy * 0.4}
                              rx={pk.rx * 1.32 * ej.rxMul}
                              ry={pk.ry * 1.26 * ej.ryMul}
                              fill={limbTint}
                              fillOpacity={Math.min(
                                LIMB_BACKDROP_HULL_BLEED_OPACITY_MAX,
                                pk.op * 0.42,
                              )}
                              transform={`rotate(${pk.rot * 0.6}, ${pk.cx}, ${pk.cy})`}
                              filter="url(#treeLimbHullBleedSoften)"
                            />
                          );
                        })}
                      </g>
                      <g
                        clipPath={`url(#limbHullClip-${hullSid})`}
                        pointerEvents="none"
                        data-tree-limb-hull-density="1"
                      >
                        <polygon
                          points={limbBackdropHull.pointsAttr}
                          fill={limbTint}
                          fillOpacity={limbBackdropHullPolygonOpacity()}
                        />
                        {pockets.map((pk) => {
                          const ej = pocketEllipseShapeJitter(pk.k);
                          return (
                            <ellipse
                              key={pk.k}
                              cx={pk.cx + ej.dcx}
                              cy={pk.cy + ej.dcy}
                              rx={pk.rx * ej.rxMul}
                              ry={pk.ry * ej.ryMul}
                              fill={limbTint}
                              fillOpacity={Math.min(LIMB_BACKDROP_HULL_POCKET_OPACITY_MAX, pk.op * 2.6)}
                              transform={`rotate(${pk.rot}, ${pk.cx + ej.dcx}, ${pk.cy + ej.dcy})`}
                              filter="url(#treeLimbHullPocketSoften)"
                            />
                          );
                        })}
                        {filaments.map((f) => (
                          <path
                            key={f.k}
                            d={f.d}
                            fill="none"
                            stroke={limbTint}
                            strokeWidth={f.strokeWidth}
                            strokeLinecap="round"
                            strokeOpacity={f.strokeOpacity}
                            filter="url(#treeLimbHullFilamentSoften)"
                          />
                        ))}
                      </g>
                      <g pointerEvents="none" data-tree-limb-hull-carry="1" aria-hidden>
                        {carryStreaks.map((st) => (
                          <ellipse
                            key={st.k}
                            cx={st.cx}
                            cy={st.cy}
                            rx={st.rx}
                            ry={st.ry}
                            fill={limbTint}
                            fillOpacity={st.fillOpacity}
                            transform={`rotate(${st.rot}, ${st.cx}, ${st.cy})`}
                            filter="url(#treeLimbHullCarrySoften)"
                          />
                        ))}
                      </g>
                    </g>
                  );
                })() : null}
                {/* Limb stem geometry only — no wide transparent hit stroke (theme gateway + label row handle navigation). */}
                <path
                  d={slots.limb}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={slots.limbStrokeWidth}
                  strokeLinecap="round"
                  pointerEvents="none"
                />

                {renderForkSpec != null && useGatewayLayout && trunkLayoutEnabled() ? (
                  <g pointerEvents="none" aria-hidden data-tree-major-limb="1">
                    <path
                      d={slots.limb}
                      fill="none"
                      stroke={area.color}
                      strokeWidth={slots.limbStrokeWidth * CONDUIT_LIMB_STEM_STROKE_SCALE * 1.15}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={
                        TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.limbStemOuterOpacity : 0.12
                      }
                    />
                    <LimbRevealStem
                      active={revealActive}
                      begin="0.2s"
                      d={slots.limb}
                      stroke={area.color}
                      strokeWidth={slots.limbStrokeWidth * CONDUIT_LIMB_STEM_STROKE_SCALE * 0.52}
                      strokeOpacity={
                        TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.limbStemMidOpacity : 0.4
                      }
                    />
                    <path
                      d={slots.limb}
                      fill="none"
                      stroke="rgba(255,255,255,0.76)"
                      strokeWidth={Math.max(0.85, slots.limbStrokeWidth * CONDUIT_LIMB_STEM_STROKE_SCALE * 0.18)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={TREE_CINEMATIC_VFX_ENABLED ? 0.34 : 0.18}
                    />
                  </g>
                ) : null}

                {FLAGS.TREE_TRUNK_VISIBLE && renderForkSpec != null && useGatewayLayout ? (
                  <g pointerEvents="none" aria-hidden data-tree-hub-trunk-filaments="1">
                    {hubTrunkFilamentSpecs(slots.limb, area.id).map((f) => (
                      <path
                        key={f.key}
                        d={f.d}
                        fill="none"
                        stroke={area.color}
                        strokeWidth={f.strokeWidth}
                        strokeOpacity={
                          f.strokeOpacity *
                          (TREE_CINEMATIC_VFX_ENABLED
                            ? TREE_CINEMATIC_VFX.hubTrunkFilamentOpacityMul
                            : 1)
                        }
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter={
                          TREE_CINEMATIC_VFX_ENABLED ? undefined : "url(#treeLimbHullFilamentSoften)"
                        }
                      />
                    ))}
                  </g>
                ) : null}

                {branchLayoutRows.map((row) => {
                  const { thread, idx, threadSlot, threadMainDraw, threadLineOpacity, threadCatalogFull } =
                    row;
                  const threadSpec = forkSpec?.branches[idx];
                  const goalsOnThread = thread.goals;
                  const kFork = sortedBranchIdx.indexOf(idx);
                  const hubFanSlot = trunkHubFanSlotIndex(area.id, idx, sortedBranchIdx);
                  const threadDcStroke = shouldDomainClusterThread(area.id, thread);
                  const domainHubPt = threadDcStroke
                    ? domainClusterHubPointFromCatalog(
                        threadCatalogFull,
                        hubFanSlot,
                        sortedBranchIdx.length,
                        dcGatewaySpreadNormal,
                        area.id,
                        layoutOverrides[area.id],
                        hubLayoutAnchors,
                        thread.id,
                      )
                    : null;
                  const limbSegT0 = kFork <= 0 ? 0 : branchForkTs[sortedBranchIdx[kFork - 1]!]!;
                  const limbSegT1 = branchForkTs[idx] ?? 0;
                  const limbSegPath =
                    forkSpec != null && limbSegT1 > limbSegT0 + 1e-9
                      ? limbPathBetweenGlobalT(forkSpec, limbSegT0, limbSegT1)
                      : "";

                  /** Hub transport stroke (trunk→gateway) — quieter than branch conduits + gateway node. */
                  const isHubLimbStem = renderForkSpec != null && useGatewayLayout;
                  const stemStrokeW = isHubLimbStem ? 0.62 : 1;
                  const stemStrokeOp = isHubLimbStem ? 0.48 : 1;

                  const emergenceRelax = 0.28;
                  const narrowThread =
                    threadSlot.strokeWidth < 2.85 * CONDUIT_THREAD_STROKE_SCALE ? 0.78 : 1;
                  const depthMul = branchIndexDepthRenderingMul(kFork, sortedBranchIdx.length);
                  const vitMat = conduitVitalityMaterialFactors(undefined);
                  const occMat = canopyOccupancyRhythmMaterialMul(undefined);
                  const strokeMul = depthMul.strokeWidthMul * vitMat.strokeWidthMul * occMat.strokeWidthMul;
                  const lineOpMul = depthMul.lineOpacityMul * vitMat.lineOpacityMul * occMat.lineOpacityMul;
                  const underlayOpMulVit = depthMul.underlayOpacityMul * vitMat.underlayOpacityMul;
                  const sigMul = threadMomentSignificanceMul(thread);
                  const jW = stableRenderJitter01(`${thread.id}:sw`);
                  const jOp = stableRenderJitter01(`${thread.id}:op`);
                  const longW = branchLongitudinalWidthSampleAvg01(thread.id, vitMat.longitudinalWaveAmpMul);
                  const opEnv = branchStrokeOpacityEnvelopeMul01(thread.id);
                  const clusterMom = milestoneClusterMaterialMul(thread.moments.length);
                  const junction = junctionMaterialAccumulation({
                    emergenceRelax01: emergenceRelax,
                    kFork,
                    momentCount: thread.moments.length,
                    goalCount: goalsOnThread.length,
                  });
                  const pressureOp =
                    branchConduitPressureOpacityMul({
                      emergenceRelax01: emergenceRelax,
                      momentCount: thread.moments.length,
                      goalCount: goalsOnThread.length,
                      significanceMul: sigMul,
                    });
                  const widthConst = branchMidRunConstrictionWidthMul(
                    thread.id,
                    thread.moments.length,
                    goalsOnThread.length,
                  );
                  const coreStrokeW =
                    threadSlot.strokeWidth *
                    strokeMul *
                    (0.976 + 0.048 * jW) *
                    longW *
                    widthConst;
                  const strokeDebusy =
                    goalsOnThread.length > 0 ? 0.82 : 1;
                  const coreOpacityCap = TREE_CINEMATIC_VFX_ENABLED
                    ? TREE_CINEMATIC_VFX.branchCoreOpacityCap
                    : 0.42;
                  const coreOpacity = Math.min(
                    coreOpacityCap,
                    threadLineOpacity *
                      lineOpMul *
                      sigMul *
                      (0.978 + 0.044 * jOp) *
                      junction.coreOpMul *
                      opEnv *
                      clusterMom *
                      pressureOp *
                      strokeDebusy,
                  );
                  const underlayExtraW =
                    (0.2 + 0.52 * emergenceRelax) *
                    narrowThread *
                    (0.88 + 0.12 * underlayOpMulVit) *
                    strokeDebusy;
                  const underlayOpacity =
                    threadLineOpacity *
                    (0.02 + 0.044 * emergenceRelax) *
                    narrowThread *
                    underlayOpMulVit *
                    sigMul *
                    0.82 *
                    junction.underlayOpMul *
                    (0.97 + 0.05 * opEnv) *
                    (0.94 + 0.12 * emergenceRelax) *
                    (0.98 + 0.04 * pressureOp) *
                    Math.pow(occMat.lineOpacityMul, 0.82) *
                    strokeDebusy *
                    (TREE_CINEMATIC_VFX_ENABLED ? TREE_CINEMATIC_VFX.branchUnderlayMul : 1);
                  const boleFilmD =
                    emergenceRelax > 0.035
                      ? polylinePathApproxBetweenT(
                          threadMainDraw,
                          0,
                          0.058 + emergenceRelax * 0.028,
                          14,
                        )
                      : "";
                  const warmFilmMul = TREE_CINEMATIC_VFX_ENABLED
                    ? TREE_CINEMATIC_VFX.branchWarmFilmMul
                    : 1;
                  const warmFilmOp = Math.min(
                    0.092,
                    junction.warmFilmOpacity * 0.52 * strokeDebusy * warmFilmMul,
                  );
                  const warmFilmHueOp = Math.min(
                    0.072,
                    junction.warmFilmOpacity * 0.4 * strokeDebusy * warmFilmMul,
                  );
                  const milestonePoolD =
                    thread.moments.length >= 2
                      ? polylinePathApproxBetweenT(threadMainDraw, 0.28, 0.7, 18)
                      : "";
                  const milestonePoolMul = TREE_CINEMATIC_VFX_ENABLED
                    ? TREE_CINEMATIC_VFX.branchMilestonePoolMul
                    : 1;
                  const milestonePoolOp =
                    thread.moments.length >= 2
                      ? Math.min(
                          0.055,
                          0.017 *
                            clusterMom *
                            sigMul *
                            (1 + 0.35 * Math.min(4, thread.moments.length - 1)) *
                            strokeDebusy *
                            milestonePoolMul,
                        )
                      : 0;

                  return (
                    <g
                      key={`${thread.id}::stroke`}
                      style={{ opacity: intraLimbBranchDepthMul(kFork, sortedBranchIdx.length) }}
                    >
                      {limbSegPath && !isHubLimbStem ? (
                        <>
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={slots.limbStrokeWidth * 2.2 * stemStrokeW}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={
                              (TREE_CINEMATIC_VFX_ENABLED
                                ? TREE_CINEMATIC_VFX.limbStemOuterOpacity
                                : 0.08) * stemStrokeOp
                            }
                            pointerEvents="none"
                          />
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={slots.limbStrokeWidth * 1.3 * stemStrokeW}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={
                              (TREE_CINEMATIC_VFX_ENABLED
                                ? TREE_CINEMATIC_VFX.limbStemMidOpacity
                                : 0.24) * stemStrokeOp
                            }
                            pointerEvents="none"
                          />
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={slots.limbStrokeWidth * 0.45 * stemStrokeW}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={
                              (TREE_CINEMATIC_VFX_ENABLED
                                ? TREE_CINEMATIC_VFX.limbStemCoreOpacity
                                : 0.38) * stemStrokeOp
                            }
                            pointerEvents="none"
                          />
                          <path
                            d={limbSegPath}
                            fill="none"
                            stroke="#e6ded4"
                            strokeWidth={slots.limbStrokeWidth * 0.52 * stemStrokeW}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={
                              (TREE_CINEMATIC_VFX_ENABLED ? 0.16 : 0.055) * stemStrokeOp
                            }
                            pointerEvents="none"
                          />
                        </>
                      ) : null}
                      {showElementGuide && limbSegPath && !isHubLimbStem ? (
                        <g data-tree-export-skip="1" pointerEvents="none">
                          <TreeElementGuideTag
                            x={pathPointAtT(limbSegPath, 0.5).x}
                            y={pathPointAtT(limbSegPath, 0.5).y - 6}
                            text={`stem-seg · ${area.id} · ${idx}`}
                          />
                        </g>
                      ) : null}
                      {limbSegPath && !threadDcStroke && !TREE_CINEMATIC_VFX_ENABLED ? (
                        <>
                          <circle
                            cx={pathPointAtT(threadMainDraw, 0.02).x}
                            cy={pathPointAtT(threadMainDraw, 0.02).y}
                            r={3.35 + 2.1 * stableRenderJitter01(`${thread.id}:junction`) + junction.diskOpacityAdd * 6}
                            fill={area.color}
                            fillOpacity={
                              (0.036 +
                                0.024 * depthMul.underlayOpacityMul * sigMul +
                                junction.diskOpacityAdd) *
                              stemStrokeOp
                            }
                            pointerEvents="none"
                            aria-hidden
                          />
                          <circle
                            cx={pathPointAtT(threadMainDraw, 0.02).x}
                            cy={pathPointAtT(threadMainDraw, 0.02).y}
                            r={1.45 + 0.55 * stableRenderJitter01(`${thread.id}:jwarm`)}
                            fill="#ebe4dc"
                            fillOpacity={
                              (0.032 +
                                0.05 * emergenceRelax * sigMul +
                                junction.diskOpacityAdd * 0.45) *
                              stemStrokeOp
                            }
                            pointerEvents="none"
                            aria-hidden
                          />
                        </>
                      ) : null}
                      {!threadDcStroke ? (
                        <>
                      <path
                        d={threadMainDraw}
                        fill="none"
                        stroke={area.color}
                        strokeWidth={coreStrokeW + underlayExtraW}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={underlayOpacity}
                        filter={
                          TREE_CINEMATIC_VFX_ENABLED
                            ? undefined
                            : "url(#treeBranchStrokeEnergyUnderlay)"
                        }
                        pointerEvents="none"
                      />
                      {milestonePoolD ? (
                        <path
                          d={milestonePoolD}
                          fill="none"
                          stroke={area.color}
                          strokeWidth={coreStrokeW * 0.82}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={milestonePoolOp}
                          pointerEvents="none"
                        />
                      ) : null}
                      {boleFilmD ? (
                        <>
                          <path
                            d={boleFilmD}
                            fill="none"
                            stroke="#d6cec3"
                            strokeWidth={coreStrokeW * 1.08}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={warmFilmOp}
                            pointerEvents="none"
                          />
                          <path
                            d={boleFilmD}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={coreStrokeW * 0.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={warmFilmHueOp}
                            pointerEvents="none"
                          />
                        </>
                      ) : null}
                      <path
                            d={threadMainDraw}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={coreStrokeW}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={coreOpacity}
                            pointerEvents="none"
                          />
                          <path
                            d={threadMainDraw}
                            fill="none"
                            stroke="rgba(255,255,255,0.72)"
                            strokeWidth={Math.max(0.75, coreStrokeW * 0.32)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={TREE_CINEMATIC_VFX_ENABLED ? Math.min(0.24, coreOpacity * 0.48) : 0.08}
                            pointerEvents="none"
                          />
                        </>
                      ) : null}
                      {threadDcStroke && domainHubPt ? (
                        <g data-tree-domain-hub="1">
                          {(() => {
                            const trunkDomainHub = trunkLayoutEnabled();
                            const hubIconPx = trunkDomainHub
                              ? TREE_DOMAIN_HUB_GLYPH_PX_TRUNK
                              : TREE_DOMAIN_HUB_GLYPH_PX;
                            const hubLabelFontBase = trunkDomainHub
                              ? TREE_DOMAIN_HUB_LABEL_FONT_PX_TRUNK
                              : TREE_DOMAIN_HUB_LABEL_FONT_PX;
                            const hubLabelFontPx =
                              hubLabelFontBase * domainHubLabelFontScale(limbLabelCtx);
                            const hubLabelOpacity = domainHubLabelOpacity(limbLabelCtx);
                            return (
                              <>
                          <g pointerEvents="none" aria-hidden data-tree-domain-spokes="1">
                            {(() => {
                              const themeGatewayPt = themeGatewayPointForArea(
                                area.id,
                                forkSpec,
                                layoutOverrides[area.id],
                              );
                              const spokePathD = domainClusterGatewayHubPathD(
                                themeGatewayPt,
                                domainHubPt,
                                area.id,
                                TREE_THEME_GATEWAY_ICON_PX,
                                hubIconPx,
                              );
                              return (
                                <LimbRevealSpoke
                                  active={revealActive}
                                  begin={`${0.5 + kFork * 0.1}s`}
                                  d={spokePathD}
                                  stroke={area.color}
                                  strokeWidth={TREE_DOMAIN_GATEWAY_SPOKE_STROKE_PX}
                                  strokeOpacity={TREE_DOMAIN_GATEWAY_SPOKE_OPACITY}
                                  strokeLinecap="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              );
                            })()}
                          </g>
                          <LimbRevealHubNode active={revealActive} begin="0.9s">
                          <g pointerEvents="none" aria-hidden>
                          {(() => {
                            const HubGlyph = branchIconForHub(area.id as LifeAreaId, thread.type, idx);
                            const hcx = snapTreeSvgScalar(domainHubPt.x);
                            const hcy = snapTreeSvgScalar(domainHubPt.y);
                            const pulseDur =
                              (2.6 + 0.9 * stableRenderJitter01(`${thread.id}:dhpulse`)).toFixed(2) + "s";
                            return (
                              <TreeIconMedallion
                                cx={hcx}
                                cy={hcy}
                                color={area.color}
                                artworkSpanPx={hubIconPx}
                                tier="domainHub"
                              >
                                <g opacity={trunkDomainHub ? 0.84 : 0.92}>
                                  {trunkDomainHub || revealActive ? null : (
                                  <animate
                                    attributeName="opacity"
                                    values="0.82;1;0.82"
                                    dur={pulseDur}
                                    repeatCount="indefinite"
                                  />
                                  )}
                                  <HubGlyph
                                    size={hubIconPx}
                                    color={area.color}
                                    opacity={trunkDomainHub ? 0.92 : 1}
                                  />
                                </g>
                              </TreeIconMedallion>
                            );
                          })()}
                          {(() => {
                            if (hubLabelOpacity < 0.04) return null;
                            const rawTitle = thread.type.trim() || "Domain";
                            const domainTitle = rawTitle;
                            const hubDiscR = iconMedallionRadii(hubIconPx, "domainHub").discR;
                            const labelGapPx = TREE_DOMAIN_HUB_LABEL_GAP_PX;
                            const labelPos = domainHubLabelLayout(
                              area.id as LifeAreaId,
                              domainHubPt,
                              hubFanSlot,
                              hubDiscR,
                              labelGapPx,
                              hubLabelFontPx,
                            );
                            return (
                              <g pointerEvents="none">
                                <title>{rawTitle}</title>
                                <TreeSvgTextLabel
                                  x={labelPos.x}
                                  y={labelPos.y}
                                  text={domainTitle}
                                  color={area.color}
                                  ink={treeMapLimbHueReadableInk(area.color)}
                                  fontSize={hubLabelFontPx}
                                  fontWeight={700}
                                  textAnchor={labelPos.textAnchor}
                                  dominantBaseline={labelPos.dominantBaseline}
                                  opacity={hubLabelOpacity}
                                  maxLines={2}
                                  maxWidthPx={hubLabelFontPx * 11}
                                  letterSpacing="0.04em"
                                />
                              </g>
                            );
                          })()}
                          </g>
                          </LimbRevealHubNode>
                          {(() => {
                            const hubDiscR = iconMedallionRadii(hubIconPx, "domainHub").discR;
                            const labelGapPx = TREE_DOMAIN_HUB_LABEL_GAP_PX;
                            const labelPos = domainHubLabelLayout(
                              area.id as LifeAreaId,
                              domainHubPt,
                              hubFanSlot,
                              hubDiscR,
                              labelGapPx,
                              hubLabelFontPx,
                            );
                            const hitW = hubDiscR * 2 + 24;
                            const labelH = hubLabelFontPx * 2.65;
                            const hitTop = Math.min(domainHubPt.y - hubDiscR - 10, labelPos.y - 4);
                            const hitBot = Math.max(
                              domainHubPt.y + hubDiscR + 10,
                              labelPos.y + labelH + 6,
                            );
                            return (
                              <rect
                                x={domainHubPt.x - hitW / 2}
                                y={hitTop}
                                width={hitW}
                                height={hitBot - hitTop}
                                fill="transparent"
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (shouldSuppressMapClick()) return;
                                  onHubClick(area, thread);
                                }}
                              />
                            );
                          })()}
                              </>
                            );
                          })()}
                        </g>
                      ) : null}
                    </g>
                  );
                })}
                {branchLayoutRows.map((row) => {
                  const {
                    thread,
                    idx,
                    threadSlot,
                    threadForTree,
                    threadMainDraw,
                    threadCatalogFull,
                    nextGoalSlotT,
                    momentChordTEnd,
                  } = row;
                  const branchStations = branchGuideStationTs(thread, nextGoalSlotT);
                  const threadGuideNearFork = pathPointAtT(threadMainDraw, 0.07);
                  const goalsOnThread = thread.goals;

                  const kFork = sortedBranchIdx.indexOf(idx);
                  const hubFanSlot = trunkHubFanSlotIndex(area.id, idx, sortedBranchIdx);
                  const threadDcForGoals = shouldDomainClusterThread(area.id, thread);
                  const domainHubPt = threadDcForGoals
                    ? domainClusterHubPointFromCatalog(
                        threadCatalogFull,
                        hubFanSlot,
                        sortedBranchIdx.length,
                        dcGatewaySpreadNormal,
                        area.id,
                        layoutOverrides[area.id],
                        hubLayoutAnchors,
                        thread.id,
                      )
                    : null;
                  const decorDcChain = domainClusterMomentChainCtx(
                    area.id,
                    row,
                    sortedBranchIdx,
                    dcGatewaySpreadNormal,
                    layoutOverrides[area.id],
                    hubLayoutAnchors,
                  );
                  return (
                    <g key={`${thread.id}::decor`}>
                      {TREE_THREAD_LABELS_ENABLED
                        ? (() => {
                            /**
                             * People domain hubs render title + slot icon at the hub (`data-tree-domain-hub`).
                             * Avoid duplicating the same label along the fork.
                             */
                            if (shouldDomainClusterThread(area.id, thread)) return null;
                            /**
                             * Thread labels sit **just past the fork** on `threadMainDraw` (low t), staggered
                             * slightly by branch index so parallel threads stay readable. Offset from the stroke
                             * is small and uniform so each label clearly belongs to that branch, not mid-arc.
                             */
                            const segCount = Math.max(1, sortedBranchIdx.length);
                            const labelPath = threadMainDraw;
                            const dt = 0.032;
                            const hubLayout =
                              forkSpec != null && isHubGatewayLayout(forkSpec) && forkSpec.branches.length > 0;
                            const labelSlotIdx = (() => {
                              if (!hubLayout || !forkSpec) return kFork;
                              const ordered = [...area.branches.keys()].sort((a, b) => {
                                const ba = forkSpec.branches[a];
                                const bb = forkSpec.branches[b];
                                if (!ba || !bb) return a - b;
                                const aa = Math.atan2(ba.tip.y - ba.forkPoint.y, ba.tip.x - ba.forkPoint.x);
                                const ab = Math.atan2(bb.tip.y - bb.forkPoint.y, bb.tip.x - bb.forkPoint.x);
                                return aa - ab;
                              });
                              return Math.max(0, ordered.indexOf(idx));
                            })();

                            const tNearFork = hubLayout ? 0.078 : 0.055;
                            const tCeiling = Math.min(
                              hubLayout ? 0.34 : 0.28,
                              Math.max(tNearFork + (hubLayout ? 0.09 : 0.06), nextGoalSlotT - 0.02),
                              Math.max(tNearFork + (hubLayout ? 0.09 : 0.06), momentChordTEnd - 0.02),
                            );
                            const band = Math.max(hubLayout ? 0.055 : 0.045, tCeiling - tNearFork);
                            const slotU = segCount <= 1 ? 0.5 : (labelSlotIdx + 0.48) / segCount;
                            const ltClamped = Math.min(0.9, Math.max(0.05, tNearFork + band * slotU));

                            /** Flip normal by branch index so neighbors sit on opposite sides. */
                            const side = labelSlotIdx % 2 === 0 ? 1 : -1;
                            const raw = thread.type.trim() || "Branch";
                            const label = raw;

                            const pt = pathPointAtT(labelPath, ltClamped);
                            const t0 = pathPointAtT(labelPath, Math.max(0, ltClamped - dt));
                            const t1 = pathPointAtT(labelPath, Math.min(1, ltClamped + dt));
                            const dx = t1.x - t0.x;
                            const dy = t1.y - t0.y;
                            const len = Math.hypot(dx, dy) || 1;
                            const nx = -dy / len;
                            const ny = dx / len;
                            const pad = hubLayout ? 10.5 + threadSlot.strokeWidth * 0.42 : 9;
                            const lx = pt.x + nx * pad * side;
                            const ly = pt.y + ny * pad * side;
                            const textAnchor =
                              Math.abs(nx) >= Math.abs(ny) * 0.85
                                ? nx * side < -0.08
                                  ? "end"
                                  : nx * side > 0.08
                                    ? "start"
                                    : "middle"
                                : "middle";
                            const threadLabelOpacity = threadPathLabelOpacity(limbLabelCtx);
                            if (threadLabelOpacity < 0.04) return null;
                            return (
                              <TreeSvgTextLabel
                                data-tree-export-skip="1"
                                x={lx}
                                y={ly}
                                text={label}
                                color={area.color}
                                ink={treeMapLimbHueReadableInk(area.color)}
                                fontSize={TREE_THREAD_PATH_LABEL_FONT_PX}
                                textAnchor={textAnchor}
                                opacity={threadLabelOpacity}
                                pointerEvents="none"
                              />
                            );
                          })()
                        : null}
                      {showElementGuide ? (
                        <g data-tree-export-skip="1" pointerEvents="none">
                          <TreeElementGuideTag
                            x={threadGuideNearFork.x}
                            y={threadGuideNearFork.y - 15}
                            text={`branchLine · ${idx} · ${thread.type}`}
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

                      {TREE_THREAD_MARKER_VISUALS_ENABLED && goalsOnThread.length > 0
                        ? (() => {
                            const goalsById = flattenGoalsById(goalsOnThread);
                            return goalsOnThread.map((g, gi) => {
                            const threadDc = shouldDomainClusterThread(area.id, thread);
                            const ringGoalCount = threadDc
                              ? domainClusterGoalRingGoalCount(thread)
                              : goalsOnThread.length;
                            const ringGi = threadDc
                              ? domainClusterGoalRingSlotIndex(thread, g.id)
                              : gi;
                            const pos = goalScreenPositionForLifeAreaThread(
                              area.id,
                              thread,
                              threadCatalogFull,
                              ringGi,
                              g.id,
                              hubFanSlot,
                              sortedBranchIdx.length,
                              ringGoalCount,
                              dcGatewaySpreadNormal,
                              layoutOverrides[area.id],
                              hubLayoutAnchors,
                              thread.id,
                            );
                            const tangOut = goalMarkerTangentOutForPlacement(
                              threadDc,
                              threadCatalogFull,
                              ringGi,
                              pos,
                              hubFanSlot,
                              sortedBranchIdx.length,
                              dcGatewaySpreadNormal,
                              area.id,
                              layoutOverrides[area.id],
                              hubLayoutAnchors,
                              thread.id,
                            );
                            const hexRotationRad = goalHexRotationRadFromTangentOut(tangOut);
                            return (
                              <g key={g.id}>
                                {threadDc && domainHubPt
                                  ? domainClusterGoalFlowSegments(domainHubPt, pos, g).map(
                                      (seg, si) => (
                                        <path
                                          key={`domain-spoke-goal-${g.id}-${si}`}
                                          data-tree-domain-spoke="1"
                                          d={domainClusterFlowSegmentPathD(
                                            seg.from,
                                            seg.to,
                                            area.id,
                                            snapTreeSvgScalar,
                                          )}
                                          fill="none"
                                          stroke={area.color}
                                          strokeWidth={pursuitConnectorStrokeWidth(
                                            goalPursuitDepth(seg.targetGoalId, goalsById),
                                          )}
                                          strokeOpacity={0.5}
                                          strokeLinecap="round"
                                          vectorEffect="non-scaling-stroke"
                                          pointerEvents="none"
                                          aria-hidden
                                        />
                                      ),
                                    )
                                  : null}
                                {/* Pursuit hex + orbital dots only (relational milestones). Marks never render here. */}
                                {renderGoalsSubtree(
                                  g,
                                  pos,
                                  area,
                                  area.color,
                                  panel,
                                  bloomPlayingIds,
                                  onGoalClick,
                                  shouldSuppressMapClick,
                                  0,
                                  idx,
                                  showElementGuide,
                                  hexRotationRad,
                                  zoomRatio,
                                  treeRenderQuality,
                                  domainHubPt,
                                  limbLabelCtx,
                                  goalsById,
                                  editMapMode,
                                  handleEditGoalPointerDown,
                                  editDraggedGoalId,
                                )}
                              </g>
                            );
                          });
                          })()
                        : null}

                      {/* Marks: sequenced beside the branch ray (diamond + label); pursuits use hex on the ray. */}
                      {TREE_THREAD_MARKER_VISUALS_ENABLED
                        ? threadForTree.moments.map((moment, momentIdx) => {
                            if (moment.synthetic === true) return null;
                            const momentLayoutCtx: DomainClusterMomentChainContext =
                              decorDcChain ?? {
                                catalogFullPath: threadCatalogFull,
                                kFork,
                                branchCountOnLimb: sortedBranchIdx.length,
                                goalsOnThread,
                                domainClusterGatewaySpreadNormal: dcGatewaySpreadNormal,
                                layoutOv: layoutOverrides[area.id],
                                layoutAnchors: hubLayoutAnchors,
                                branchId: thread.id,
                              };

                            const pos = resolvedChainMomentPos(
                              area.id,
                              idx,
                              threadForTree,
                              momentIdx,
                              threadCatalogFull,
                              layoutOverrides[area.id]?.momentPositions,
                              momentChordTEnd,
                              threadMainDraw,
                              momentLayoutCtx,
                            );
                            const sx = snapTreeSvgScalar(pos.x);
                            const sy = snapTreeSvgScalar(pos.y);

                            return (
                              <g key={moment.id}>
                                {showElementGuide && momentIdx === 0 ? (
                                  <g data-tree-export-skip="1" pointerEvents="none">
                                    <TreeElementGuideTag
                                      x={sx}
                                      y={sy + MARK_DIAMOND_HALF_PX + 14}
                                      text="timeline-mark"
                                    />
                                  </g>
                                ) : null}
                                <TreeMarkNode
                                  moment={moment}
                                  area={area}
                                  x={pos.x}
                                  y={pos.y}
                                  zoomRatio={zoomRatio}
                                  isSelected={selectedMomentId === moment.id}
                                  shouldSuppressClick={shouldSuppressMapClick}
                                  onMarkClick={onMarkClick}
                                  onMarkPointerEnter={onMarkPointerEnter}
                                  onMarkPointerLeave={onMarkPointerLeave}
                                />
                                {TREE_LAYOUT_EDIT_ENABLED && layoutEditByAreaId[area.id] ? (
                                  <circle
                                    data-layout-edit-handle="1"
                                    cx={sx}
                                    cy={sy}
                                    r={MARK_DIAMOND_HALF_PX + 12}
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
                                      const worldPt = clientToWorldSvg(
                                        svgRef.current,
                                        e.clientX,
                                        e.clientY,
                                        viewWidth,
                                        viewHeight,
                                        transform,
                                      );
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

                {isUnlockedEmpty && FLAGS.TREE_LATENT_POTENTIAL && useGatewayLayout && renderForkSpec ? (() => {
                  if (obHubPickActive && !obHubPickSelected) return null;
                  const gw = themeGatewayPointForArea(area.id, renderForkSpec, layoutOverrides[area.id]);
                  const ghostSlots = ghostHubSlotsForArea(areaLimbId);
                  if (!ghostSlots.length) return null;
                  const hubIconPx = TREE_DOMAIN_HUB_GLYPH_PX_TRUNK;
                  const discR = iconMedallionRadii(hubIconPx, "domainHub").discR;
                  const obHubPick =
                    onboardingHubPickMode != null &&
                    onboardingHubPickMode.themeId === areaLimbId;
                  const spokeOpacityMul = obHubPick ? 1.15 : 0.7;
                  const hubStrokeOpacity = obHubPick ? 0.88 : 0.85;
                  const labelOpacity = obHubPick ? 0.9 : 0.5;
                  const ghostGroup = (
                    <g
                      data-tree-ghost-hubs="1"
                      pointerEvents={obHubPick ? "auto" : "none"}
                      aria-hidden={obHubPick ? undefined : true}
                    >
                      {ghostSlots.map(({ tip, template, slotIndex }) => {
                        const hx = snapTreeSvgScalar(tip.x);
                        const hy = snapTreeSvgScalar(tip.y);
                        const HubGlyph = branchIconForHub(areaLimbId, template.threadType, slotIndex);
                        const ghostLabelFontPx = TREE_DOMAIN_HUB_LABEL_FONT_PX_TRUNK;
                        const ghostLabelPos = domainHubLabelLayout(
                          areaLimbId,
                          tip,
                          slotIndex,
                          discR,
                          TREE_DOMAIN_HUB_LABEL_GAP_PX,
                          ghostLabelFontPx,
                        );
                        const hubSlug = normalizeHubLabelKey(template.name);
                        const hubNode = (
                          <g data-tree-ghost-hub="1">
                            <line
                              x1={snapTreeSvgScalar(gw.x)}
                              y1={snapTreeSvgScalar(gw.y)}
                              x2={hx}
                              y2={hy}
                              stroke={area.color}
                              strokeWidth={TREE_DOMAIN_GATEWAY_SPOKE_STROKE_PX}
                              strokeLinecap="round"
                              opacity={TREE_DOMAIN_GATEWAY_SPOKE_OPACITY * spokeOpacityMul}
                            />
                            {obHubPick ? (
                              <circle
                                cx={hx}
                                cy={hy}
                                r={discR + 14}
                                fill={area.color}
                                opacity={0.22}
                                pointerEvents="none"
                              />
                            ) : null}
                            <circle
                              cx={hx}
                              cy={hy}
                              r={discR}
                              fill={obHubPick ? `${area.color}22` : "none"}
                              stroke={area.color}
                              strokeWidth={obHubPick ? 2 : 1.5}
                              opacity={hubStrokeOpacity}
                              style={obHubPick ? { cursor: "pointer" } : undefined}
                              onClick={
                                obHubPick
                                  ? (e) => {
                                      e.stopPropagation();
                                      onboardingHubPickMode?.onHubSelect(hubSlug);
                                    }
                                  : undefined
                              }
                            />
                            <g transform={`translate(${hx},${hy})`} pointerEvents="none">
                              <HubGlyph size={hubIconPx} color={area.color} opacity={hubStrokeOpacity} />
                            </g>
                            <TreeSvgTextLabel
                              x={ghostLabelPos.x}
                              y={ghostLabelPos.y}
                              text={template.name}
                              color={area.color}
                              ink={treeMapLimbHueReadableInk(area.color)}
                              fontSize={ghostLabelFontPx}
                              fontWeight={700}
                              textAnchor={ghostLabelPos.textAnchor}
                              dominantBaseline={ghostLabelPos.dominantBaseline}
                              opacity={labelOpacity}
                              maxLines={2}
                              maxWidthPx={ghostLabelFontPx * 11}
                              letterSpacing="0.04em"
                            />
                          </g>
                        );
                        return <g key={template.threadType}>{hubNode}</g>;
                      })}
                    </g>
                  );
                  return ghostGroup;
                })() : null}

                {limbFocusPulseActive ? (
                  <g data-tree-focus-path-pulse="1" pointerEvents="none" aria-hidden>
                    {renderForkSpec != null && useGatewayLayout && !goalPanelPulseGoalId ? (
                      <TreeFocusPathPulse
                        d={polylinePathApproxBetweenT(slots.limb, 0.52, 1, 14)}
                        color={area.color}
                        strokeWidth={Math.max(2.2, slots.limbStrokeWidth * 0.38)}
                        phaseSec={0}
                        durSec={2.85}
                        opacity={focusedLimbId === area.id ? 0.46 : 0.38}
                        dashPx={18}
                        gapPx={30}
                      />
                    ) : null}
                    {branchLayoutRows.flatMap((row, pulseIdx) => {
                      const { thread, idx, threadMainDraw, threadDomainCluster, threadCatalogFull } =
                        row;
                      const goalsOnThread = thread.goals;
                      const goalPanelOnly =
                        goalPanelPulseGoalId != null && focusedLimbId !== area.id;
                      const threadHasGoalPanelTarget =
                        goalPanelPulseGoalId != null &&
                        threadContainsGoal(goalsOnThread, goalPanelPulseGoalId);
                      if (goalPanelOnly && !threadHasGoalPanelTarget) return [];
                      const phaseBase = pulseIdx * 0.24;
                      const threadDur = 2.3 + stableRenderJitter01(`${thread.id}:focus-pulse`) * 0.55;
                      const limbWidePulse = focusedLimbId === area.id;
                      const kFork = sortedBranchIdx.indexOf(idx);
                      const hubFanSlot = trunkHubFanSlotIndex(area.id, idx, sortedBranchIdx);

                      if (threadDomainCluster) {
                        const domainHubPt = domainClusterHubPointFromCatalog(
                          threadCatalogFull,
                          hubFanSlot,
                          sortedBranchIdx.length,
                          dcGatewaySpreadNormal,
                          area.id,
                          layoutOverrides[area.id],
                          hubLayoutAnchors,
                          thread.id,
                        );
                        const themeGatewayPt = themeGatewayPointForArea(
                          area.id,
                          forkSpec,
                          layoutOverrides[area.id],
                        );
                        const pulses = [
                          <TreeFocusPathPulse
                            key={`${thread.id}:focus-gateway-hub`}
                            d={domainClusterGatewayHubPathD(
                              themeGatewayPt,
                              domainHubPt,
                              area.id,
                              TREE_THEME_GATEWAY_ICON_PX,
                              trunkLayoutEnabled()
                                ? TREE_DOMAIN_HUB_GLYPH_PX_TRUNK
                                : TREE_DOMAIN_HUB_GLYPH_PX,
                            )}
                            color={area.color}
                            strokeWidth={limbWidePulse ? 2.2 : 2}
                            phaseSec={phaseBase}
                            durSec={threadDur}
                            opacity={limbWidePulse ? 0.58 : 0.64}
                          />,
                        ];
                        goalsOnThread.forEach((g) => {
                          if (goalPanelOnly && !goalInSubtree(g, goalPanelPulseGoalId!)) return;
                          const ringN = domainClusterGoalRingGoalCount(thread);
                          const ringGi = domainClusterGoalRingSlotIndex(thread, g.id);
                          const gp = goalScreenPositionForLifeAreaThread(
                            area.id,
                            thread,
                            threadCatalogFull,
                            ringGi,
                            g.id,
                            hubFanSlot,
                            sortedBranchIdx.length,
                            ringN,
                            dcGatewaySpreadNormal,
                            layoutOverrides[area.id],
                            hubLayoutAnchors,
                            thread.id,
                          );
                          domainClusterGoalFlowSegments(domainHubPt, gp, g).forEach(
                            (seg, si) => {
                              pulses.push(
                                <TreeFocusPathPulse
                                  key={`${thread.id}:focus-spoke-${g.id}-${si}`}
                                  d={domainClusterFlowSegmentPathD(seg.from, seg.to, area.id)}
                                  color={area.color}
                                  strokeWidth={limbWidePulse ? 2.15 : 1.95}
                                  phaseSec={phaseBase + 0.14 + si * 0.08}
                                  durSec={threadDur}
                                  opacity={limbWidePulse ? 0.56 : 0.62}
                                />,
                              );
                            },
                          );
                        });
                        return pulses;
                      }

                      return [
                        <TreeFocusPathPulse
                          key={`${thread.id}:focus-thread`}
                          d={threadMainDraw}
                          color={area.color}
                          strokeWidth={limbWidePulse ? 2.35 : 2.15}
                          phaseSec={phaseBase + 0.18}
                          durSec={threadDur}
                          opacity={limbWidePulse ? 0.56 : 0.62}
                        />,
                      ];
                    })}
                  </g>
                ) : null}

                {(() => {
                  const isHubGw = renderForkSpec != null && useGatewayLayout;
                  const LimbIc = limbIconForLifeArea(area.id as LifeAreaId);
                  const ic = limbIconCenterNearLifeAreaLabel(lifeAreaLabel, area.label, TREE_LIMB_ICON_SIZE_PX);
                  const icx = snapTreeSvgScalar(ic.x);
                  const icy = snapTreeSvgScalar(ic.y);
                  const dh = limbLabelDecorHull;
                  const gatewayPt = isHubGw ? renderForkSpec!.limbTip : null;
                  const themeMedallion =
                    gatewayPt != null ? iconMedallionRadii(TREE_THEME_GATEWAY_ICON_PX, "theme") : null;
                  const clusterHit =
                    gatewayPt != null && themeMedallion != null
                      ? themeGatewayClusterHitBounds(
                          gatewayPt,
                          lifeAreaLabel,
                          area.label,
                          themeMedallion.bloomR,
                        )
                      : null;
                  let hitX0 = Math.min(dh[0]!.x, dh[1]!.x, dh[2]!.x, dh[3]!.x);
                  let hitX1 = Math.max(dh[0]!.x, dh[1]!.x, dh[2]!.x, dh[3]!.x);
                  let hitY0 = Math.min(dh[0]!.y, dh[1]!.y, dh[2]!.y, dh[3]!.y);
                  let hitY1 = Math.max(dh[0]!.y, dh[1]!.y, dh[2]!.y, dh[3]!.y);
                  if (clusterHit) {
                    hitX0 = clusterHit.x0;
                    hitY0 = clusterHit.y0;
                    hitX1 = clusterHit.x1;
                    hitY1 = clusterHit.y1;
                  }
                  const onLimbLabelRowClick = (e: MouseEvent<SVGElement>) => {
                    e.stopPropagation();
                    if (shouldSuppressMapClick()) return;
                    if (isActivating) return;
                    if (obHubPickActive && !obHubPickSelected) {
                      onAreaClick(area);
                      return;
                    }
                    // Theme gateway / icon opens the theme panel; dormant themes activate on click.
                    if (isDormant || (clusterHit && gatewayPt)) {
                      onAreaClick(area);
                      return;
                    }
                    if (FLAGS.FOCUS_MODE) {
                      onToggleLimbFocus(area.id);
                    } else {
                      onAreaClick(area);
                    }
                  };
                  const limbIconHitR =
                    normalizedLimbIconSize(area.id as LifeAreaId, TREE_LIMB_ICON_SIZE_PX) * 0.55 + 14;
                  const dormantAriaLabel = `Add ${themeDisplayLabel} to your tree`;
                  return (
                    <g
                      data-tree-limb-label-row="1"
                      data-tree-theme-cluster={clusterHit ? "1" : undefined}
                      data-tree-dormant-gateway={isDormant ? "1" : undefined}
                      style={{ cursor: isActivating ? "wait" : "pointer" }}
                    >
                      <rect
                        x={hitX0}
                        y={hitY0}
                        width={Math.max(1, hitX1 - hitX0)}
                        height={Math.max(1, hitY1 - hitY0)}
                        fill="transparent"
                        pointerEvents="none"
                        aria-hidden
                      />
                      {clusterHit && gatewayPt ? (
                        <g data-tree-gateway-node="1">
                          <circle
                            cx={snapTreeSvgScalar(gatewayPt.x)}
                            cy={snapTreeSvgScalar(gatewayPt.y)}
                            r={themeMedallion!.discR + 8}
                            fill="transparent"
                            pointerEvents="all"
                            style={{ cursor: isActivating ? "wait" : "pointer" }}
                            aria-label={isDormant ? dormantAriaLabel : undefined}
                            onClick={onLimbLabelRowClick}
                          />
                          {isActivating ? (
                            <circle
                              cx={snapTreeSvgScalar(gatewayPt.x)}
                              cy={snapTreeSvgScalar(gatewayPt.y)}
                              r={themeMedallion!.discR + 10}
                              fill="none"
                              stroke={area.color}
                              strokeWidth={2}
                              pointerEvents="none"
                              opacity={0.55}
                            >
                              <animate
                                attributeName="r"
                                values={`${themeMedallion!.discR + 6};${themeMedallion!.discR + 14};${themeMedallion!.discR + 6}`}
                                dur="1.1s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="opacity"
                                values="0.35;0.85;0.35"
                                dur="1.1s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          ) : obHubPickSelected ? (
                            <>
                              <circle
                                cx={snapTreeSvgScalar(gatewayPt.x)}
                                cy={snapTreeSvgScalar(gatewayPt.y)}
                                r={themeMedallion!.discR + 18}
                                fill="none"
                                stroke={area.color}
                                strokeWidth={2}
                                pointerEvents="none"
                                opacity={0.45}
                              />
                              <circle
                                cx={snapTreeSvgScalar(gatewayPt.x)}
                                cy={snapTreeSvgScalar(gatewayPt.y)}
                                r={themeMedallion!.discR + 11}
                                fill="none"
                                stroke={area.color}
                                strokeWidth={2.5}
                                pointerEvents="none"
                                opacity={0.92}
                              />
                            </>
                          ) : null}
                          <LimbRevealGateway
                            active={revealActive}
                            begin="0s"
                            cx={snapTreeSvgScalar(gatewayPt.x)}
                            cy={snapTreeSvgScalar(gatewayPt.y)}
                          >
                            <TreeIconMedallion
                              cx={snapTreeSvgScalar(gatewayPt.x)}
                              cy={snapTreeSvgScalar(gatewayPt.y)}
                              color={area.color}
                              artworkSpanPx={TREE_THEME_GATEWAY_ICON_PX}
                              tier="theme"
                            >
                              <LimbIc
                                size={normalizedLimbIconSize(area.id as LifeAreaId, TREE_THEME_GATEWAY_ICON_PX)}
                                color={area.color}
                                opacity={1}
                              />
                            </TreeIconMedallion>
                          </LimbRevealGateway>
                        </g>
                      ) : (
                        <>
                          {isActivating ? (
                            <circle
                              cx={icx}
                              cy={icy}
                              r={limbIconHitR}
                              fill="none"
                              stroke={area.color}
                              strokeWidth={2}
                              pointerEvents="none"
                              opacity={0.55}
                            >
                              <animate
                                attributeName="r"
                                values={`${limbIconHitR * 0.92};${limbIconHitR * 1.14};${limbIconHitR * 0.92}`}
                                dur="1.1s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="opacity"
                                values="0.35;0.85;0.35"
                                dur="1.1s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          ) : obHubPickSelected ? (
                            <>
                              <circle
                                cx={icx}
                                cy={icy}
                                r={limbIconHitR * 1.22}
                                fill="none"
                                stroke={area.color}
                                strokeWidth={2}
                                pointerEvents="none"
                                opacity={0.45}
                              />
                              <circle
                                cx={icx}
                                cy={icy}
                                r={limbIconHitR * 1.06}
                                fill="none"
                                stroke={area.color}
                                strokeWidth={2.5}
                                pointerEvents="none"
                                opacity={0.92}
                              />
                            </>
                          ) : null}
                          <circle
                            cx={icx}
                            cy={icy}
                            r={limbIconHitR}
                            fill="transparent"
                            pointerEvents="all"
                            style={{ cursor: isActivating ? "wait" : "pointer" }}
                            aria-label={isDormant ? dormantAriaLabel : undefined}
                            onClick={onLimbLabelRowClick}
                          />
                          <g data-tree-limb-label-icon="1" pointerEvents="none">
                            <g transform={`translate(${icx},${icy})`}>
                              <LimbIc
                                size={normalizedLimbIconSize(area.id as LifeAreaId, TREE_LIMB_ICON_SIZE_PX)}
                                color={area.color}
                                opacity={isDormant ? 0.72 : 0.92}
                              />
                            </g>
                          </g>
                        </>
                      )}
                      <TreeSvgTextLabel
                        x={lifeAreaLabel.x}
                        y={lifeAreaLabel.y}
                        text={
                          TREE_THEME_SHORT_LABEL[area.id as LifeAreaId] ?? area.label
                        }
                        color={area.color}
                        ink={treeMapLimbHueReadableInk(area.color)}
                        fontSize={TREE_LIFE_AREA_TITLE_FONT_PX}
                        fontWeight={500}
                        fontFamily={TREE_THEME_CANVAS_SERIF}
                        fontStyle="italic"
                        textAnchor={lifeAreaLabel.textAnchor}
                        opacity={lifeAreaTitleOpacity(limbLabelCtx)}
                        letterSpacing="0.005em"
                        pill={trunkLayoutEnabled()}
                        pointerEvents="visiblePainted"
                        onClick={onLimbLabelRowClick}
                      />
                    </g>
                  );
                })()}
                {showElementGuide ? (
                  <g data-tree-export-skip="1" pointerEvents="none">
                    <TreeElementGuideTag
                      x={lifeAreaLabel.x}
                      y={lifeAreaLabel.y - 11}
                      text={`life-area · ${area.id}`}
                      anchor={lifeAreaLabel.textAnchor}
                    />
                  </g>
                ) : null}
                  </g>
                </GhostPulse>
              </DormantPulse>
              {(isDormant ||
                isActivating ||
                obHubPickSelected ||
                (isUnlockedEmpty && !obHubPickActive)) &&
              !(obHubPickPeer && !isActivating) ? (
                <TreeSvgTextLabel
                  x={lifeAreaLabel.x}
                  y={lifeAreaLabel.y + (TREE_LIFE_AREA_TITLE_FONT_PX + 6) * 0.55}
                  text={
                    isActivating
                      ? "Adding to your map…"
                      : isDormant
                        ? "Tap to add"
                        : obHubPickSelected
                          ? "Pick a track"
                          : "Open a hub in the panel"
                  }
                  color={area.color}
                  ink={treeMapLimbHueReadableInk(area.color)}
                  fontSize={11}
                  fontWeight={600}
                  fontFamily={TREE_THEME_CANVAS_SERIF}
                  textAnchor={lifeAreaLabel.textAnchor}
                  opacity={(isActivating ? 0.95 : obHubPickSelected ? 0.9 : 0.62) * composedLimbOpacity}
                  letterSpacing="0.06em"
                  pointerEvents="none"
                />
              ) : null}
              </Fragment>
            );
          })}
          {/* eslint-enable react-hooks/refs */}
          {previewAreas && previewAreas.length > 0 ? (
            <StreamPreviewMarkersLayer
              previewAreas={previewAreas}
              allAreasForForkGeometry={allAreasForForkGeometry}
              resolvedForks={resolvedForks}
              layoutOverrides={layoutOverrides}
              panel={panel}
              bloomPlayingIds={bloomPlayingIds}
              zoomRatio={zoomRatio}
              onGoalClick={onGoalClick}
            />
          ) : null}
          <rect
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fill="url(#treeStageEdgeVignette)"
            opacity={
              onboardingHubPickMode
                ? 0.1
                : TREE_CINEMATIC_VFX_ENABLED
                  ? TREE_CINEMATIC_VFX.stageEdgeVignette
                  : 0.38
            }
            pointerEvents="none"
            aria-hidden
            data-tree-compose-vignette="1"
          />
          {FLAGS.TREE_TRUNK_VISIBLE ? (
            <>
              {/* Luminous trunk film after strokes: overlap zone tints branch (cradle), avoids under-stack “slice” at silhouette. */}
              <g pointerEvents="none" aria-hidden data-tree-trunk-emergence-blend="1">
                <path d={TREE_TRUNK_PRESSURE_LAYERS.veinD} fill="url(#trunkInnerVeinGrad)" opacity={0.238} />
                <path d={TREE_TRUNK_PRESSURE_LAYERS.veilD} fill="url(#trunkAtmosphericVeilGrad)" opacity={0.092} />
              </g>
            </>
          ) : null}
          {showElementGuide ? (
            <g data-tree-export-skip="1" pointerEvents="none">
              <rect
                x={118}
                y={258}
                width={200}
                height={158}
                rx={6}
                fill="rgba(8,6,10,0.9)"
                stroke="#57534E"
                strokeWidth={0.5}
              />
              <text x={128} y={278} fill="#E7E5E4" fontSize={10.5} fontFamily="ui-monospace, monospace" fontWeight={600}>
                Tree map (use in chat)
              </text>
              <text x={128} y={294} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                life-area · title + id
              </text>
              <text x={128} y={306} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                stem-seg · trunk→fork piece
              </text>
              <text x={128} y={318} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                branchLine · index + type (whole branch)
              </text>
              <text x={128} y={330} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                branch-seg · fork→goal→bud pieces
              </text>
              <text x={128} y={342} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                branch-fork-seg · sibling sprout
              </text>
              <text x={128} y={354} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                domain-hub · opens hub panel
              </text>
              <text x={128} y={366} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                roadmap-goal · plan node
              </text>
              <text x={128} y={378} fill="#A8A29E" fontSize={8.5} fontFamily="ui-monospace, monospace">
                timeline-moment · zoom to see
              </text>
              <text x={128} y={392} fill="#78716C" fontSize={8} fontFamily="ui-monospace, monospace">
                PDF export hides these tags
              </text>
            </g>
          ) : null}
          {TREE_DEBUG_GEOM_ENABLED ? (
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
                const hubLayoutAnchors = {
                  trunkAttach: fs.trunkAttach,
                  gateway: fs.limbTip,
                };
                const limbTipPt = limbStrokeEndPoint(fs);
                const limbC2 = areaForkStemFirstC2(fs);
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
                const areaLayoutOv = layoutOverrides[area.id];
                const dcSpread = domainClusterGatewaySpreadNormalForForkSpec(fs);
                const sortedBranchIdxForEdit = area.branches
                  .map((_, i) => i)
                  .sort((a, b) => compareBranchIndicesForStemOrder(fs, a, b));
                const hubDragNodes = area.branches.flatMap((thread, ti) => {
                  if (!shouldDomainClusterThread(area.id, thread)) return [];
                  const thSpec = fs.branches[ti];
                  if (!thSpec) return [];
                  const hubFanSlot = trunkHubFanSlotIndex(area.id, ti, sortedBranchIdxForEdit);
                  const catalogPath = branchMainPathUntilGlobalT(thSpec, 1);
                  const hubPt = domainClusterHubPointFromCatalog(
                    catalogPath,
                    hubFanSlot,
                    fs.branches.length,
                    dcSpread,
                    area.id,
                    areaLayoutOv,
                    hubLayoutAnchors,
                    thread.id,
                  );
                  return [
                    <g key={`layout-hub-${area.id}-${thread.id}`} data-layout-edit-handle="1">
                      <circle
                        cx={hubPt.x}
                        cy={hubPt.y}
                        r={16}
                        fill="rgba(251, 146, 60, 0.28)"
                        stroke="#FB923C"
                        strokeWidth={2.5}
                        style={{ cursor: "grab", touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          layoutDragRef.current = {
                            kind: "domainHub",
                            areaId: area.id,
                            branchId: thread.id,
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
                            d.kind !== "domainHub" ||
                            d.areaId !== area.id ||
                            d.branchId !== thread.id ||
                            d.pointerId !== e.pointerId ||
                            !svgRef.current
                          ) {
                            return;
                          }
                          if (!hasCrossedLayoutDragThreshold(d, e.clientX, e.clientY)) return;
                          const pt = clientToWorldSvg(
                            svgRef.current,
                            e.clientX,
                            e.clientY,
                            viewWidth,
                            viewHeight,
                            transform,
                          );
                          patchHubLayout(area.id, thread.id, pt);
                        }}
                        onPointerUp={releaseLayoutPointer}
                        onPointerCancel={releaseLayoutPointer}
                      />
                    </g>,
                  ];
                });
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
                return [...limbNodes, ...hubDragNodes, ...threadNodes];
              })
            : null}
          <TreeEditMapOverlay
            enabled={editMapMode}
            areas={editMapDraftAreas ?? areas}
            resolvedForks={resolvedForks}
            layoutOverrides={layoutOverrides}
            svgRef={svgRef}
            transform={transform}
            onPanMoved={notifyPanMoved}
            beginGoalDragRef={beginGoalDragRef}
            onLayoutPreviewChange={handleEditLayoutPreviewChange}
            onDraftDrop={(op, nextAreas) => onEditMapDraftDrop?.(op, nextAreas)}
          />
          </g>
        </g>
      </svg>
      </div>
      {process.env.NODE_ENV === "development" && TREE_LAYOUT_EDIT_ENABLED && !suppressDevUi ? (
        <TreeLayoutDevPanel
          areas={areas}
          allAreasForForkGeometry={allAreasForForkGeometry}
          layoutOverrides={layoutOverrides}
          setLayoutOverrides={setLayoutOverrides}
          resolvedForks={resolvedForks}
          layoutEditByAreaId={layoutEditByAreaId}
          onToggleAreaLayoutEdit={toggleAreaLayoutEdit}
          onSetAllLayoutEdit={setAllLayoutEdit}
          onFocusLimb={focusLimbInView}
          collapsed={layoutDevPanelCollapsed}
          onCollapsedChange={setLayoutDevPanelCollapsed}
        />
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
          title="Overview — fit full tree in view"
          aria-label="Overview — fit full tree in view"
          onClick={(e) => {
            e.stopPropagation();
            setTransform(treeFitTransform);
          }}
          style={{
            minWidth: 32,
            height: 32,
            padding: "0 8px",
            borderRadius: 8,
            border: "none",
            background: "rgba(0,0,0,0.5)",
            color: "white",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          Overview
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

export const TreeSVG = memo(TreeSVGInner);