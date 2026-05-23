"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { AddGoalModal } from "@/components/goals/add-goal-modal";
import { TreeConversationalGoalCreate } from "@/components/tree/tree-conversational-goal-create";
import { buildPreviewAreasFromNodes } from "@/components/stream/stream-hub-preview-data";
import { useMapData } from "@/contexts/map-data-context";
import { StreamPreviewProvider, useStreamPreview } from "@/contexts/stream-preview-context";
import { FirstRunWelcomeOverlay } from "@/components/onboarding/first-run-welcome-overlay";
import { OnboardingCoachMark } from "@/components/onboarding/OnboardingCoachMark";
import { findFirstRunFocusTarget, resolveFirstRunPrimaryLimbId } from "@/lib/first-run-focus";
import { getFirstRunStreamPrompt } from "@/lib/first-run-stream-prompts";
import { buildStreamHubUiFromThread, buildStreamThemeUiFromArea } from "@/lib/stream-theme-ui";
import type { LifeAreaId } from "@/lib/types";
import type { TreeFirstRunConfig } from "@/types/first-run";
import type { StreamUiSession } from "@/types/stream";
import { TreeCanvasHud } from "@/components/tree/tree-canvas-hud";
import { PF_TREE_CANVAS_CSS, TREE_DETAIL_RAIL_WIDTH_PX } from "@/components/tree/tree-canvas-shell";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import { FLAGS } from "@/lib/flags";
import type { ApiBranchRow } from "@/lib/api-branch-row";
import type { SequenceAnchor } from "@/lib/branch-sequence";
import { canonicalHubDisplayLabel, hubFirstTimeQuestion } from "@/lib/hub-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { TREE_THEME_SHORT_LABEL } from "@/components/tree/tree-design-visual";
import { LIFE_AREA_ORDER } from "./tree-data";
import { normalizeHubLabelKey } from "@/lib/taxonomy";
import { applyTreeDensity } from "./tree-density";
import { AddAreaModal } from "./add-area-modal";
import { useBackgroundMapPrefetch } from "@/hooks/use-background-map-prefetch";
import { activateHubOnServer, unlockThemeOnServer } from "./tree-activate-limb";
import { ActivateThemeConfirmModal } from "./activate-theme-confirm-modal";
import { dormantLimbIdsFromUnlocked, mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";
import type { AreaData, MomentNode, TreeGoalNode } from "./tree-types";
import { TreeSVG } from "./tree-svg";
import {
  applyEditMapDraftOps,
  buildEditMapStreamDraft,
  type EditMapDraftOp,
} from "./tree-edit-map-draft";
import { TreeEditMapDoneDialog } from "./tree-edit-map-done-dialog";
import { SwimlaneTimeline } from "@/components/timeline/swimlane-timeline";
// BranchView remains in `./tree-alternate-views.tsx`; it is currently unwired from the map HUD.
import { MarkHoverCard, type MarkInteractionAnchor } from "./mark-hover-card";
import { TreePanel } from "./tree-panel";
import {
  normalizeArchivedGoalsFromBranches,
  normalizeMarks,
} from "./tree-view-normalize";
import { countRoadmapGoalsOnThread, findGoalInAreas, findMarkInAreas } from "./tree-view-goal-queries";
import {
  TREE_ELEMENT_GUIDE_ENABLED,
  TREE_MAP_SURFACE_FILL,
} from "./tree-view-constants";
import {
  type AddGoalHubContext,
  type ArchivedGoalRow,
  type CoachMarkStep,
  type OnboardingSproutState,
  type PanelState,
  type ViewMode,
} from "./tree-view-types";

async function readApiFailureMessage(res: Response, fallback: string, includeStack: boolean): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: string; phase?: string; stack?: string };
    if (typeof j.error === "string" && j.error.length > 0) {
      const parts = [j.error];
      if (typeof j.phase === "string" && j.phase.length > 0) parts.push(`phase: ${j.phase}`);
      if (includeStack && typeof j.stack === "string" && j.stack.length > 0) parts.push(j.stack);
      return parts.join("\n");
    }
  } catch {
    /* non-JSON */
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function TreeView({
  firstRun,
  onboardingLocked = false,
  isOnboardingGuideActive = false,
  initialCoachMarkStep = null,
}: {
  firstRun: TreeFirstRunConfig;
  onboardingLocked?: boolean;
  isOnboardingGuideActive?: boolean;
  initialCoachMarkStep?: CoachMarkStep;
}) {
  return (
    <StreamPreviewProvider>
      <TreeViewInner
        firstRun={firstRun}
        onboardingLocked={onboardingLocked}
        isOnboardingGuideActive={isOnboardingGuideActive}
        initialCoachMarkStep={initialCoachMarkStep}
      />
    </StreamPreviewProvider>
  );
}

function TreeViewInner({
  firstRun,
  onboardingLocked,
  isOnboardingGuideActive,
  initialCoachMarkStep,
}: {
  firstRun: TreeFirstRunConfig;
  onboardingLocked: boolean;
  isOnboardingGuideActive: boolean;
  initialCoachMarkStep: CoachMarkStep;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update: refreshSession } = useSession();
  const { snapshot: mapDataSnapshot, ensureLoaded: ensureMapDataLoaded, refetch: refetchMapData } = useMapData();
  const prefetchMapData = useBackgroundMapPrefetch();
  const [firstRunCompleted, setFirstRunCompleted] = useState(firstRun.completed);
  const firstRunCompletedRef = useRef(firstRun.completed);
  const primaryLimbIdRef = useRef(firstRun.primaryLimbId);
  useEffect(() => {
    firstRunCompletedRef.current = firstRunCompleted;
  }, [firstRunCompleted]);
  useEffect(() => {
    primaryLimbIdRef.current = firstRun.primaryLimbId;
  }, [firstRun.primaryLimbId]);
  const mapDeepLinkHandled = useRef<string | null>(null);
  const isDev = process.env.NODE_ENV === "development";
  const { previewNodes, pendingPreviewNode, clearPreviewNodes } = useStreamPreview();
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [archivedGoals, setArchivedGoals] = useState<ArchivedGoalRow[]>([]);
  const [archivedMarks, setArchivedMarks] = useState<
    Array<{ id: string; branchId: string; title: string; date?: string | Date | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [focusedLimbId, setFocusedLimbId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ type: "none" });
  const [markHover, setMarkHover] = useState<MarkInteractionAnchor | null>(null);
  const [markPinned, setMarkPinned] = useState<MarkInteractionAnchor | null>(null);
  const hoverMarksEnabledRef = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addGoalDefaultBranchId, setAddGoalDefaultBranchId] = useState<string | null>(null);
  const [addGoalDefaultAnchor, setAddGoalDefaultAnchor] = useState<SequenceAnchor | null>(null);
  const [conversationalGoalCtx, setConversationalGoalCtx] = useState<AddGoalHubContext | null>(null);
  const [panelStreamSession, setPanelStreamSession] = useState<StreamUiSession | null>(null);
  const [editMapMode, setEditMapMode] = useState(false);
  const [editMapDraftAreas, setEditMapDraftAreas] = useState<AreaData[] | null>(null);
  const [editMapPendingOps, setEditMapPendingOps] = useState<EditMapDraftOp[]>([]);
  const [editMapExitOpen, setEditMapExitOpen] = useState(false);
  const [editMapApplying, setEditMapApplying] = useState(false);
  const [apiBranchRows, setApiBranchRows] = useState<ApiBranchRow[]>([]);
  const [treeToast, setTreeToast] = useState<{ msg: string; color: string } | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [addAreaOpen, setAddAreaOpen] = useState(false);
  const [activatingLimbId, setActivatingLimbId] = useState<LifeAreaId | null>(null);
  const [limbRevealLimbId, setLimbRevealLimbId] = useState<LifeAreaId | null>(null);
  const [recentlyUnlockedLimbId, setRecentlyUnlockedLimbId] = useState<LifeAreaId | null>(null);
  const [unlockedLimbIds, setUnlockedLimbIds] = useState<LifeAreaId[]>([]);
  const [pendingThemeConfirm, setPendingThemeConfirm] = useState<LifeAreaId | null>(null);
  const [coachMarkStep, setCoachMarkStep] = useState<CoachMarkStep>(initialCoachMarkStep);
  const [onboardingSprout, setOnboardingSprout] = useState<OnboardingSproutState>(null);
  const keepStreamPreviewOnCloseRef = useRef(false);

  useEffect(() => {
    if (!isOnboardingGuideActive) {
      setCoachMarkStep(null);
      return;
    }
    setCoachMarkStep(initialCoachMarkStep);
  }, [initialCoachMarkStep, isOnboardingGuideActive]);

  const advanceOnboardingGuide = useCallback(
    async (scene: number, payload: { themeId?: string | null; hubSlug?: string | null } = {}) => {
      if (!isOnboardingGuideActive) return;
      try {
        await fetch("/api/onboarding/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene, ...payload }),
        });
      } catch (err) {
        console.error("[onboarding-guide] advance failed", err);
      }
    },
    [isOnboardingGuideActive],
  );

  useEffect(() => {
    try {
      window.localStorage.removeItem("pathfinder.tree.mockUserId");
      window.localStorage.removeItem("pathfinder-tree-mock-user-id");
      window.localStorage.removeItem("pathfinder_mock_density");
    } catch {
      /* ignore */
    }
  }, []);

  const loadData = useCallback(async (options?: {
    silent?: boolean;
    afterSetAreas?: () => void;
  }): Promise<AreaData[] | undefined> => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const result = silent
        ? await refetchMapData()
        : mapDataSnapshot?.ok && Array.isArray(mapDataSnapshot.areas)
          ? mapDataSnapshot
          : await ensureMapDataLoaded();

      if (!result.ok) {
        console.error("[tree-view] GET /api/branches failed — tree will show trunk only", {
          detail: result.error,
        });
        setTreeToast({
          msg:
            result.error ??
            "Could not load hubs. Stop the dev server, run npx prisma generate, restart, then sign out and sign in.",
          color: "#e85d5d",
        });
        return undefined;
      }

      const { marksJson, branchesJson } = result;
      const branchesPayload = branchesJson as {
        branches?: ApiBranchRow[];
        unlockedLimbIds?: LifeAreaId[];
      };
      const rows = Array.isArray(branchesPayload.branches) ? branchesPayload.branches : [];
      setApiBranchRows(rows);
      const storedUnlocked = parseUnlockedLimbIds(branchesPayload.unlockedLimbIds);
      setUnlockedLimbIds(mergeUnlockedLimbIds(storedUnlocked, rows));
      const allMarks = normalizeMarks(marksJson ?? { marks: [] });
      const marks = allMarks.filter((m) => !m.archived);
      setArchivedMarks(
        allMarks
          .filter((m) => m.archived && typeof m.id === "string" && typeof m.branchId === "string")
          .map((m) => ({
            id: m.id,
            branchId: m.branchId,
            title: (m.title ?? "Mark").trim() || "Mark",
            date: m.date ?? null,
          })),
      );
      const by = marksJson?.user?.birthYear;
      let nextBirth: number | null = null;
      if (typeof by === "number" && Number.isFinite(by)) nextBirth = by;
      else if (by != null) {
        const n = Number(by);
        if (Number.isFinite(n)) nextBirth = n;
      }
      setBirthYear(nextBirth);
      if (isDev) {
        if (FLAGS.TREE_DEBUG_MOMENT_CHAIN) {
          console.log("[tree-view] GET /api/marks → normalized marks used by tree", {
            count: marks.length,
            marks: marks.map((m) => ({ id: m.id, branchId: m.branchId, title: m.title ?? null })),
          });
          console.log(
            `[tree-view] confirm marks loading: count=${marks.length} (${marks.length > 0 ? "ok — data reached TreeView" : "empty — tree will show no mark-backed moments"})`,
          );
        }
      }
      setArchivedGoals(normalizeArchivedGoalsFromBranches(branchesJson));
      let nextAreas: AreaData[];
      try {
        nextAreas = applyTreeDensity(result.areas, FLAGS.TREE_DENSITY);
      } catch (mapErr) {
        console.error("[tree-view] applyTreeDensity failed", mapErr);
        setTreeToast({
          msg: "Tree data could not be built. Check the console and try refreshing.",
          color: "#e85d5d",
        });
        return undefined;
      }
      setAreas(nextAreas);
      options?.afterSetAreas?.();
      if (isDev) {
        const hubSlots = nextAreas.reduce((n, a) => n + a.branches.length, 0);
        console.log("[tree-view] tree data loaded", {
          lifeAreas: nextAreas.length,
          hubSlots,
          goals: nextAreas.reduce((n, a) => n + a.branches.reduce((m, b) => m + b.goals.length, 0), 0),
          marks: marks.length,
        });
      }
      return nextAreas;
    } catch (err) {
      const aborted = err instanceof Error && err.name === "TimeoutError";
      console.error("[tree-view] loadData failed", err);
      setTreeToast({
        msg: aborted
          ? "Tree load timed out. Restart the dev server and refresh."
          : "Could not load tree data. Sign out and sign in again.",
        color: "#e85d5d",
      });
      setAreas([]);
      setApiBranchRows([]);
      setBirthYear(null);
      return undefined;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ensureMapDataLoaded, isDev, mapDataSnapshot, refetchMapData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    hoverMarksEnabledRef.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);


  const clearAll = useCallback(() => {
    setFocused(null);
    if (FLAGS.FOCUS_MODE) setFocusedLimbId(null);
    setPanel({ type: "none" });
    setPanelStreamSession(null);
    clearPreviewNodes();
    setConversationalGoalCtx(null);
    setMarkHover(null);
    setMarkPinned(null);
  }, [clearPreviewNodes]);

  const buildMarkAnchor = useCallback(
    (moment: MomentNode, area: AreaData, clientX: number, clientY: number): MarkInteractionAnchor => {
      const thread = areas
        .flatMap((a) => a.branches)
        .find((t) => t.id === moment.branchId);
      return {
        moment,
        area,
        hubLabel: thread?.type.trim() || "Hub",
        clientX,
        clientY,
      };
    },
    [areas],
  );

  const markHoverDismissRef = useRef<number | null>(null);

  const clearMarkHoverDismissTimer = useCallback(() => {
    if (markHoverDismissRef.current != null) {
      window.clearTimeout(markHoverDismissRef.current);
      markHoverDismissRef.current = null;
    }
  }, []);

  const dismissMarkCard = useCallback(() => {
    clearMarkHoverDismissTimer();
    setMarkPinned(null);
    setMarkHover(null);
  }, [clearMarkHoverDismissTimer]);

  const handleMarkPointerEnter = useCallback(
    (anchor: MarkInteractionAnchor) => {
      if (!hoverMarksEnabledRef.current || markPinned) return;
      clearMarkHoverDismissTimer();
      setMarkHover(anchor);
    },
    [markPinned, clearMarkHoverDismissTimer],
  );

  const handleMarkPointerLeave = useCallback(
    (momentId: string) => {
      if (!hoverMarksEnabledRef.current || markPinned) return;
      clearMarkHoverDismissTimer();
      markHoverDismissRef.current = window.setTimeout(() => {
        setMarkHover((curr) => (curr?.moment.id === momentId ? null : curr));
      }, 200);
    },
    [markPinned, clearMarkHoverDismissTimer],
  );

  const handleMarkCardHoverEnter = useCallback(() => {
    clearMarkHoverDismissTimer();
  }, [clearMarkHoverDismissTimer]);

  const handleMarkCardHoverLeave = useCallback(() => {
    if (markPinned) return;
    clearMarkHoverDismissTimer();
    markHoverDismissRef.current = window.setTimeout(() => setMarkHover(null), 120);
  }, [markPinned, clearMarkHoverDismissTimer]);

  const handleMarkClick = useCallback((anchor: MarkInteractionAnchor) => {
    setMarkPinned((curr) => (curr?.moment.id === anchor.moment.id ? null : anchor));
    setMarkHover(null);
  }, []);

  const onToggleLimbFocus = useCallback((limbId: string) => {
    if (!FLAGS.FOCUS_MODE) return;
    setFocusedLimbId((curr) => (curr === limbId ? null : limbId));
  }, []);

  useEffect(() => {
    if (!FLAGS.FOCUS_MODE) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedLimbId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleHubClick = useCallback((area: AreaData, thread: AreaData["branches"][number]) => {
    setFocused(area.id);
    setPanel({ type: "hub", area, thread });
    if (isOnboardingGuideActive && coachMarkStep === "tap_hub") {
      setCoachMarkStep("open_stream");
      advanceOnboardingGuide(4, {
        themeId: area.id,
        hubSlug: normalizeHubLabelKey(thread.type.trim() || thread.id),
      });
    }
  }, [advanceOnboardingGuide, coachMarkStep, isOnboardingGuideActive]);

  const showTreeToast = useCallback((msg: string, color = "#7B68C8") => {
    setTreeToast({ msg, color });
    window.setTimeout(() => setTreeToast(null), 2400);
  }, []);

  const handleResolveAmbiguousMark = useCallback(
    async (
      markId: string,
      resolution: "done" | "in_progress" | "not_started",
      targetBranchId?: string,
    ) => {
      try {
        const res = await fetch("/api/stream/resolve-ambiguous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markId, resolution, targetBranchId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Resolve failed (${res.status})`) };
        }
        await loadData({ silent: true });
        showTreeToast(
          resolution === "done" ? "Marked as done on your map." : "Added as a pursuit on this hub.",
        );
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while resolving." };
      }
    },
    [loadData, showTreeToast],
  );

  const handleSparseEnriched = useCallback(async () => {
    await loadData({ silent: true });
    showTreeToast("Context saved.");
  }, [loadData, showTreeToast]);

  const [streamPanFocus, setStreamPanFocus] = useState<{
    areaId: string;
    branchId: string;
    key: number;
  } | null>(null);

  useEffect(() => {
    if (loading || areas.length === 0) return;

    const goalId = searchParams.get("goalId");
    const markId = searchParams.get("markId");
    const linkKey = goalId ? `goal:${goalId}` : markId ? `mark:${markId}` : null;
    if (!linkKey || mapDeepLinkHandled.current === linkKey) return;

    if (goalId) {
      const found = findGoalInAreas(areas, goalId);
      if (!found) return;
      mapDeepLinkHandled.current = linkKey;
      setFocused(found.area.id);
      setPanel({ type: "goal", goal: found.goal, area: found.area });
      setStreamPanFocus({
        areaId: found.area.id,
        branchId: found.goal.branchId,
        key: Date.now(),
      });
      router.replace("/tree");
      return;
    }

    if (markId) {
      const found = findMarkInAreas(areas, markId);
      if (!found) return;
      mapDeepLinkHandled.current = linkKey;
      setFocused(found.area.id);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setMarkPinned({
        moment: found.moment,
        area: found.area,
        hubLabel: found.hubLabel,
        clientX: cx,
        clientY: cy,
      });
      setMarkHover(null);
      setStreamPanFocus({
        areaId: found.area.id,
        branchId: found.moment.branchId,
        key: Date.now(),
      });
      router.replace("/tree");
    }
  }, [areas, loading, router, searchParams]);

  const streamPanHubRef = useRef<{ areaId: string; branchId: string } | null>(null);
  const handleStreamCardFocusHub = useCallback((areaId: string, branchId: string) => {
    if (!branchId) return;
    const prev = streamPanHubRef.current;
    if (prev?.areaId === areaId && prev?.branchId === branchId) return;
    streamPanHubRef.current = { areaId, branchId };
    setStreamPanFocus({ areaId, branchId, key: Date.now() });
  }, []);

  const clearEditMapDraft = useCallback(() => {
    setEditMapDraftAreas(null);
    setEditMapPendingOps([]);
  }, []);

  const handleEditMapDraftDrop = useCallback((op: EditMapDraftOp, nextAreas: AreaData[]) => {
    setEditMapDraftAreas(nextAreas);
    setEditMapPendingOps((prev) => {
      const rest = prev.filter((existing) => existing.goalId !== op.goalId);
      return [...rest, op];
    });
  }, []);

  const requestExitEditMap = useCallback(() => {
    if (editMapPendingOps.length > 0) {
      setEditMapExitOpen(true);
      return;
    }
    setEditMapMode(false);
    clearEditMapDraft();
  }, [clearEditMapDraft, editMapPendingOps.length]);

  const applyEditMapSession = useCallback(async (): Promise<boolean> => {
    if (editMapPendingOps.length === 0) return true;
    setEditMapApplying(true);
    const result = await applyEditMapDraftOps(editMapPendingOps);
    setEditMapApplying(false);
    if (!result.ok) {
      showTreeToast(result.error);
      return false;
    }
    await loadData({ silent: true });
    return true;
  }, [editMapPendingOps, loadData, showTreeToast]);

  const finishEditMapAfterApply = useCallback(() => {
    setEditMapExitOpen(false);
    setEditMapMode(false);
    clearEditMapDraft();
  }, [clearEditMapDraft]);

  const handleEditMapApply = useCallback(async () => {
    const ok = await applyEditMapSession();
    if (ok) finishEditMapAfterApply();
  }, [applyEditMapSession, finishEditMapAfterApply]);

  const handleEditMapDiscard = useCallback(() => {
    setEditMapExitOpen(false);
    setEditMapMode(false);
    clearEditMapDraft();
  }, [clearEditMapDraft]);

  const handleEditMapDiscussInStream = useCallback(async () => {
    const streamDraft = buildEditMapStreamDraft(editMapPendingOps);
    const firstGoalId = editMapPendingOps[0]?.goalId;
    const found = firstGoalId ? findGoalInAreas(areas, firstGoalId) : null;
    const area = (focused ? areas.find((a) => a.id === focused) : null) ?? found?.area ?? areas[0] ?? null;
    const ok = await applyEditMapSession();
    if (!ok) return;
    finishEditMapAfterApply();
    if (!area) return;
    const theme = buildStreamThemeUiFromArea(area);
    if (theme.hubs.length === 0) {
      showTreeToast("No hubs found for this theme — try refreshing the tree.");
      return;
    }
    setPanel({ type: "area", area });
    setFocusedLimbId(area.id);
    setPanelStreamSession({ mode: "theme", theme, initialDraft: streamDraft });
  }, [
    applyEditMapSession,
    areas,
    editMapPendingOps,
    finishEditMapAfterApply,
    focused,
    showTreeToast,
  ]);

  useEffect(() => {
    if (!panelStreamSession) return;
    setEditMapMode(false);
    setEditMapExitOpen(false);
    clearEditMapDraft();
  }, [clearEditMapDraft, panelStreamSession]);

  const handleOpenThemeStream = useCallback((area: AreaData) => {
    const theme = buildStreamThemeUiFromArea(area);
    if (theme.hubs.length === 0) {
      showTreeToast("No hubs found for this theme — try refreshing the tree.");
      return;
    }
    setPanel({ type: "area", area });
    setFocusedLimbId(area.id);
    setPanelStreamSession({ mode: "theme", theme });
  }, [showTreeToast]);

  const handleOpenHubStream = useCallback((area: AreaData, thread: AreaData["branches"][number], initialPlaceholder?: string) => {
    const hub = buildStreamHubUiFromThread(area, thread);
    const hubLabel = thread.type.trim() || hub.branchLabel;
    const onboardingPlaceholder =
      isOnboardingGuideActive
        ? hubFirstTimeQuestion(area.id, hubLabel)
        : undefined;
    setPanel({ type: "hub", area, thread });
    setFocusedLimbId(area.id);
    setPanelStreamSession({
      mode: "hub",
      hub,
      onboardingMode: isOnboardingGuideActive,
      ...(onboardingPlaceholder ? { onboardingQuestion: onboardingPlaceholder } : {}),
      ...((onboardingPlaceholder ?? initialPlaceholder)
        ? { initialPlaceholder: (onboardingPlaceholder ?? initialPlaceholder)! }
        : {}),
    });
    if (isOnboardingGuideActive && coachMarkStep === "open_stream") {
      setCoachMarkStep(null);
      advanceOnboardingGuide(5, {
        themeId: area.id,
        hubSlug: normalizeHubLabelKey(hubLabel),
      });
    }
  }, [advanceOnboardingGuide, coachMarkStep, isOnboardingGuideActive]);

  const handleOpenGoalStream = useCallback((area: AreaData, goal: TreeGoalNode) => {
    const thread = area.branches.find((branch) => branch.id === goal.branchId);
    if (!thread) {
      showTreeToast("Could not open Stream for this pursuit — try refreshing.");
      return;
    }
    const hub = buildStreamHubUiFromThread(area, thread);
    setPanel({ type: "goal", area, goal });
    setFocusedLimbId(area.id);
    setPanelStreamSession({
      mode: "hub",
      hub,
      sourceGoalId: goal.id,
      initialPlaceholder: `Tell me more about "${goal.title}" — milestones, next steps, or context for this pursuit.`,
    });
  }, [showTreeToast]);

  const applyFirstRunFocus = useCallback(
    (loadedAreas: AreaData[]) => {
      const target = findFirstRunFocusTarget(loadedAreas, primaryLimbIdRef.current);
      if (!target) return;

      setFocused(target.area.id);
      setFocusedLimbId(target.area.id);
      dismissMarkCard();

      if (target.kind === "goal") {
        setPanel({ type: "goal", goal: target.goal, area: target.area });
        setStreamPanFocus({
          areaId: target.area.id,
          branchId: target.goal.branchId,
          key: Date.now(),
        });
        return;
      }

      const found = findMarkInAreas(loadedAreas, target.markId);
      if (!found) return;

      setPanel({ type: "none" });
      const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
      const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
      setMarkPinned({
        moment: found.moment,
        area: found.area,
        hubLabel: found.hubLabel,
        clientX: cx,
        clientY: cy,
      });
      setMarkHover(null);
      setStreamPanFocus({
        areaId: found.area.id,
        branchId: found.moment.branchId,
        key: Date.now(),
      });
    },
    [dismissMarkCard],
  );

  const handleFirstRunStart = useCallback(() => {
    const limbId = resolveFirstRunPrimaryLimbId(primaryLimbIdRef.current, areas);
    if (!limbId) {
      showTreeToast("No themes on your tree yet — try refreshing.");
      return;
    }
    const area = areas.find((a) => a.id === limbId);
    if (!area) {
      showTreeToast("Could not open Stream for this theme — try refreshing.");
      return;
    }
    const theme = buildStreamThemeUiFromArea(area);
    if (theme.hubs.length === 0) {
      showTreeToast("No hubs found for this theme — try refreshing the tree.");
      return;
    }
    setPanel({ type: "area", area });
    setFocusedLimbId(area.id);
    setPanelStreamSession({
      mode: "theme",
      theme,
      initialPlaceholder: getFirstRunStreamPrompt(limbId as LifeAreaId),
    });
  }, [areas, showTreeToast]);

  const handleStreamCommitted = useCallback(() => {
    const wasFirstRun = !firstRunCompletedRef.current;
    if (wasFirstRun) {
      firstRunCompletedRef.current = true;
      setFirstRunCompleted(true);
    }

    const updatingToast = "Saved to your map — updating...";
    setTreeToast({ msg: updatingToast, color: "#7B68C8" });

    void loadData({
      silent: true,
      afterSetAreas: () => {
        clearPreviewNodes();
        setTreeToast((current) => (current?.msg === updatingToast ? null : current));
      },
    }).then((loadedAreas) => {
      if (wasFirstRun && loadedAreas?.length) {
        applyFirstRunFocus(loadedAreas);
      }
    });

    if (wasFirstRun) {
      void (async () => {
        try {
          const res = await fetch("/api/first-run/complete", { method: "POST" });
          if (res.ok) {
            await refreshSession();
            showTreeToast("Your map has started.");
            return;
          }
          firstRunCompletedRef.current = false;
          setFirstRunCompleted(false);
        } catch {
          firstRunCompletedRef.current = false;
          setFirstRunCompleted(false);
        }
      })();

      return;
    }
  }, [applyFirstRunFocus, clearPreviewNodes, loadData, refreshSession, showTreeToast]);

  const handleOnboardingFirstCardConfirmed = useCallback(() => {
    if (!isOnboardingGuideActive || panelStreamSession?.mode !== "hub") return;

    const { hub } = panelStreamSession;
    setOnboardingSprout({
      areaId: hub.areaId,
      branchId: hub.branchId,
      key: Date.now(),
    });

    window.setTimeout(() => {
      void (async () => {
        await advanceOnboardingGuide(6, {
          themeId: hub.areaId,
          hubSlug: normalizeHubLabelKey(hub.branchLabel),
        });
        clearPreviewNodes();
        setPanelStreamSession(null);
        setStreamPanFocus(null);
        streamPanHubRef.current = null;
        router.refresh();
      })();
    }, 900);
  }, [advanceOnboardingGuide, clearPreviewNodes, isOnboardingGuideActive, panelStreamSession, router]);

  const showFirstRunWelcome =
    !onboardingLocked && !firstRunCompleted && !panelStreamSession && !loading && areas.length > 0;

  const handleAddGoalOnHub = useCallback((hub: AddGoalHubContext) => {
    setAddGoalDefaultBranchId(hub.branchId);
    setAddGoalDefaultAnchor(hub.sequenceAnchor ?? null);
    if (FLAGS.CONVERSATIONAL_GOAL_CREATE) {
      setConversationalGoalCtx({
        ...hub,
        anchorClient:
          hub.sequenceAnchor != null
            ? hub.anchorClient
            : {
                x: window.innerWidth / 2,
                y: Math.min(window.innerHeight - 100, window.innerHeight * 0.5),
              },
      });
      return;
    }
    setAddGoalOpen(true);
  }, []);

  const handleGoalClick = useCallback((goal: TreeGoalNode, area: AreaData) => {
    let close = false;
    setPanel((curr) => {
      close = curr.type === "goal" && curr.goal.id === goal.id;
      return close ? { type: "none" } : { type: "goal", goal, area };
    });
    setFocused(close ? null : area.id);
  }, []);

  const visibleAreas = areas;

  const previewNodesForTree = useMemo(() => {
    if (!pendingPreviewNode) return previewNodes;
    const withoutPending = previewNodes.filter((n) => n.id !== pendingPreviewNode.id);
    return [...withoutPending, pendingPreviewNode];
  }, [previewNodes, pendingPreviewNode]);

  const previewAreas = useMemo(
    () => buildPreviewAreasFromNodes(areas, previewNodesForTree),
    [areas, previewNodesForTree],
  );

  const handleNavigateToGoal = useCallback(
    (goalId: string) => {
      const found = findGoalInAreas(visibleAreas, goalId);
      if (!found) return;
      setFocused(found.area.id);
      setPanel((curr) => {
        const returnTo =
          curr.type === "hub"
            ? { type: "hub" as const, area: curr.area, thread: curr.thread }
            : curr.type === "goal"
              ? curr.returnTo
              : undefined;
        return { type: "goal", goal: found.goal, area: found.area, ...(returnTo ? { returnTo } : {}) };
      });
    },
    [visibleAreas],
  );

  const addGoalBranches = useMemo(
    () =>
      apiBranchRows
        .filter((b) => !b.parentBranchId)
        .map((b) => {
          const raw = (b.label ?? b.name ?? "").trim() || "Hub";
          return {
            id: b.id,
            lifeAreaId: b.limbId,
            label: canonicalHubDisplayLabel(b.limbId, raw),
            isActive: b.isActive === true,
          };
        }),
    [apiBranchRows],
  );

  const dormantLimbIds = useMemo(
    () => dormantLimbIdsFromUnlocked(unlockedLimbIds),
    [unlockedLimbIds],
  );

  const onboardingCoachMark = useMemo(() => {
    if (!isOnboardingGuideActive || !coachMarkStep) return null;
    switch (coachMarkStep) {
      case "tap_theme": {
        const preferredTheme = firstRun.primaryLimbId ?? "work";
        return {
          targetSelector: `[data-tree-gateway-node][data-area-id="${preferredTheme}"], [data-tree-gateway-node]`,
          instruction: "Tap a theme to begin",
          accentColor: getLifeArea(preferredTheme as LifeAreaId)?.color ?? "#EF9F27",
        };
      }
      case "tap_hub": {
        const accentColor = panel.type === "area" ? panel.area.color : "#EF9F27";
        return {
          targetSelector: `[data-onboarding-coach="first-hub"]`,
          instruction: "Tap a track to open it",
          accentColor,
        };
      }
      case "open_stream": {
        if (panel.type !== "hub") return null;
        const hubLabel = panel.thread.type.trim() || "Hub";
        return {
          targetSelector: `[data-onboarding-coach="open-stream"]`,
          instruction: "Tell me what's on your mind here",
          accentColor: panel.area.color,
          areaId: panel.area.id,
          hubLabel,
          hubSlug: normalizeHubLabelKey(hubLabel),
        };
      }
      default:
        return null;
    }
  }, [coachMarkStep, firstRun.primaryLimbId, isOnboardingGuideActive, panel]);
  const onboardingCoachMarkActive = isOnboardingGuideActive && coachMarkStep != null;

  const handleAreaClick = useCallback(
    (area: AreaData) => {
      const limbId = area.id as LifeAreaId;
      if (dormantLimbIds.includes(limbId)) {
        if (activatingLimbId || panelStreamSession || editMapMode) return;
        setPendingThemeConfirm(limbId);
        return;
      }
      setFocused(area.id);
      setPanel({ type: "area", area });
      if (isOnboardingGuideActive && coachMarkStep === "tap_theme") {
        setCoachMarkStep("tap_hub");
        advanceOnboardingGuide(3, { themeId: area.id, hubSlug: null });
      }
    },
    [
      activatingLimbId,
      advanceOnboardingGuide,
      coachMarkStep,
      dormantLimbIds,
      editMapMode,
      isOnboardingGuideActive,
      panelStreamSession,
    ],
  );

  const handleConfirmThemeUnlock = useCallback(async () => {
    const limbId = pendingThemeConfirm;
    if (!limbId) return;
    const lifeArea = getLifeArea(limbId);
    const shortLabel = TREE_THEME_SHORT_LABEL[limbId] ?? lifeArea?.label ?? limbId;
    const accent = lifeArea?.color ?? "#7B68C8";
    const previousUnlocked = unlockedLimbIds;
    const optimisticArea = areas.find((a) => a.id === limbId);

    setPendingThemeConfirm(null);
    setUnlockedLimbIds((prev) => (prev.includes(limbId) ? prev : [...prev, limbId]));
    setFocused(limbId);
    setLimbRevealLimbId(limbId);
    setRecentlyUnlockedLimbId(limbId);
    if (optimisticArea) {
      setPanel({ type: "area", area: optimisticArea });
    }

    const result = await unlockThemeOnServer(limbId);
    if (!result.ok) {
      setUnlockedLimbIds(previousUnlocked);
      setFocused(null);
      setLimbRevealLimbId(null);
      setRecentlyUnlockedLimbId(null);
      setPanel({ type: "none" });
      showTreeToast(result.error ?? "Could not add this area.", "#e85d5d");
      return;
    }

    if (result.unlockedLimbIds) {
      setUnlockedLimbIds(result.unlockedLimbIds);
    }

    prefetchMapData();
    void loadData({ silent: true }).then((nextAreas) => {
      const fresh = nextAreas?.find((a) => a.id === limbId);
      if (fresh) {
        setFocused(limbId);
        setPanel({ type: "area", area: fresh });
      }
    });
    if (isOnboardingGuideActive && coachMarkStep === "tap_theme") {
      setCoachMarkStep("tap_hub");
      advanceOnboardingGuide(3, { themeId: limbId, hubSlug: null });
    }

    showTreeToast(
      `${shortLabel} is on your map — choose a hub to open first in the panel.`,
      accent,
    );
    window.setTimeout(() => setLimbRevealLimbId(null), 950);
    window.setTimeout(() => setRecentlyUnlockedLimbId(null), 14_000);
  }, [
    advanceOnboardingGuide,
    areas,
    coachMarkStep,
    isOnboardingGuideActive,
    loadData,
    pendingThemeConfirm,
    prefetchMapData,
    showTreeToast,
    unlockedLimbIds,
  ]);

  const handleActivateHubFromPanel = useCallback(
    async (branchId: string, area: AreaData) => {
      const result = await activateHubOnServer(branchId);
      if (!result.ok) {
        showTreeToast(result.error ?? "Could not open this hub.", "#e85d5d");
        return;
      }
      const nextAreas = await loadData({ silent: true });
      const fresh = nextAreas?.find((a) => a.id === area.id) ?? area;
      const thread = fresh.branches.find((b) => b.id === branchId);
      if (thread) {
        setFocused(area.id);
        setPanel({ type: "hub", area: fresh, thread });
        const hubLabel = thread.type.trim() || thread.id;
        const shouldAutoOpenStream =
          (result.activated ?? 0) > 0 &&
          countRoadmapGoalsOnThread(thread) === 0 &&
          !isOnboardingGuideActive;

        if (shouldAutoOpenStream) {
          handleOpenHubStream(
            fresh,
            thread,
            hubFirstTimeQuestion(fresh.id, hubLabel),
          );
        }
        showTreeToast(`Opened ${thread.type.trim() || "hub"}.`);
        if (isOnboardingGuideActive && coachMarkStep === "tap_hub") {
          setCoachMarkStep("open_stream");
          advanceOnboardingGuide(4, {
            themeId: area.id,
            hubSlug: normalizeHubLabelKey(thread.type.trim() || thread.id),
          });
        }
      } else {
        setFocused(area.id);
        setPanel({ type: "area", area: fresh });
        showTreeToast("Hub opened.");
      }
    },
    [advanceOnboardingGuide, coachMarkStep, handleOpenHubStream, isOnboardingGuideActive, loadData, showTreeToast],
  );

  const patchGoal = useCallback(
    async (
      goalId: string,
      body: {
        title?: string;
        timelineStartIso?: string | null;
        deadlineIso?: string | null;
        archived?: boolean;
        bloomStatus?: "ACTIVE" | "ON_HOLD" | "COMPLETE";
      },
    ) => {
      try {
        const payload: Record<string, unknown> = {};
        if (body.title !== undefined) payload.title = body.title;
        if (body.timelineStartIso !== undefined) payload.timelineStart = body.timelineStartIso;
        if (body.deadlineIso !== undefined) payload.deadline = body.deadlineIso;
        if ("archived" in body && body.archived !== undefined) payload.archived = body.archived;
        if (body.bloomStatus !== undefined) payload.bloomStatus = body.bloomStatus;
        const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Update failed (${res.status})`) };
        }
        await loadData({ silent: true });
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while updating pursuit." };
      }
    },
    [loadData],
  );

  const handleTimelineDeleteMoment = useCallback(
    async (momentId: string) => {
      try {
        const res = await fetch(`/api/marks/${encodeURIComponent(momentId)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Remove failed (${res.status})`) };
        }
        await loadData({ silent: true });
        dismissMarkCard();
        showTreeToast("Mark removed from map.");
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while removing mark." };
      }
    },
    [loadData, showTreeToast, dismissMarkCard],
  );

  useEffect(() => {
    const h = () => {
      void loadData({ silent: true });
    };
    window.addEventListener(PATHFINDER_GOALS_CHANGED_EVENT, h);
    return () => window.removeEventListener(PATHFINDER_GOALS_CHANGED_EVENT, h);
  }, [loadData]);

  const treeExportRootRef = useRef<HTMLDivElement | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showTreeElementGuide, setShowTreeElementGuide] = useState(false);

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
        backgroundColor: TREE_MAP_SURFACE_FILL,
        cacheBust: true,
        filter: (node) => {
          let cur: Node | null = node;
          while (cur) {
            if (cur instanceof Element && cur.getAttribute("data-tree-export-skip") === "1") return false;
            cur = cur.parentNode;
          }
          return true;
        },
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

  useEffect(() => {
    const onExport = () => {
      void handleExportTreePdf();
    };
    window.addEventListener("pathfinder:export-tree-pdf", onExport);
    return () => window.removeEventListener("pathfinder:export-tree-pdf", onExport);
  }, [handleExportTreePdf]);

  const handleMarkPointerEnterNode = useCallback(
    (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => {
      handleMarkPointerEnter(buildMarkAnchor(moment, area, clientX, clientY));
    },
    [buildMarkAnchor, handleMarkPointerEnter],
  );

  const handleMarkClickNode = useCallback(
    (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => {
      handleMarkClick(buildMarkAnchor(moment, area, clientX, clientY));
    },
    [buildMarkAnchor, handleMarkClick],
  );

  const detailRailOpen = panel.type === "goal" || panel.type === "hub" || panel.type === "area";
  const detailRailLabel =
    panel.type === "hub" ? "Hub details" : panel.type === "area" ? "Theme details" : "Pursuit details";
  const treePanelKey =
    panel.type === "goal"
      ? `goal-${panel.goal.id}`
      : panel.type === "area"
        ? `area-${panel.area.id}`
        : panel.type === "hub"
          ? `hub-${panel.thread.id}`
          : "none";

  const markCardAnchor = markPinned ?? markHover;
  const activeMarkId = markCardAnchor?.moment.id ?? null;

  const mapViews = (
    <>
      {viewMode === "tree" ? (
        <TreeSVG
          areas={visibleAreas}
          previewAreas={previewAreas.length > 0 ? previewAreas : undefined}
          allAreasForForkGeometry={areas}
          focused={focused}
          focusedLimbId={focusedLimbId}
          onToggleLimbFocus={onToggleLimbFocus}
          panel={panel}
          onClear={clearAll}
          onAreaClick={handleAreaClick}
          onHubClick={handleHubClick}
          activeMarkId={activeMarkId}
          onMarkPointerEnter={handleMarkPointerEnterNode}
          onMarkPointerLeave={handleMarkPointerLeave}
          onMarkClick={handleMarkClickNode}
          onGoalClick={handleGoalClick}
          exportRootRef={treeExportRootRef}
          showElementGuide={TREE_ELEMENT_GUIDE_ENABLED && showTreeElementGuide}
          suppressDevUi={onboardingLocked && process.env.NODE_ENV !== "development"}
          panDisabled={onboardingCoachMarkActive}
          onboardingSprout={onboardingSprout}
          onOnboardingSproutComplete={() => setOnboardingSprout(null)}
          streamPanFocus={streamPanFocus}
          streamPanelWidthPx={0}
          editMapMode={editMapMode && !panelStreamSession}
          editMapDraftAreas={editMapDraftAreas}
          onEditMapDraftDrop={handleEditMapDraftDrop}
          dormantLimbIds={dormantLimbIds}
          unlockedLimbIds={unlockedLimbIds}
          activatingLimbId={activatingLimbId}
          limbRevealLimbId={limbRevealLimbId}
        />
      ) : null}
      {viewMode === "timeline" ? (
        <SwimlaneTimeline
          areas={visibleAreas}
          birthYear={birthYear}
          focused={focused}
          onAreaClick={handleAreaClick}
          activeMarkId={activeMarkId}
          onMarkPointerEnter={handleMarkPointerEnterNode}
          onMarkPointerLeave={handleMarkPointerLeave}
          onMarkClick={handleMarkClickNode}
          onGoalClick={handleGoalClick}
          onUpdateGoalTimeline={async (goalId, body) => {
            const result = await patchGoal(goalId, body);
            if (result.ok) showTreeToast("Timeline dates saved.");
            return result;
          }}
        />
      ) : null}
    </>
  );

  const handlePanelDeleteGoal = useCallback(
    async (goalId: string) => {
      try {
        const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Delete failed (${res.status})`) };
        }
        await loadData({ silent: true });
        setPanel({ type: "none" });
        showTreeToast("Pursuit removed from map.");
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while removing pursuit." };
      }
    },
    [loadData, showTreeToast],
  );

  const handlePanelReviveGoal = useCallback(
    async (goalId: string) => {
      const result = await patchGoal(goalId, { archived: false });
      if (result.ok) showTreeToast("Pursuit restored to your map.");
      return result;
    },
    [patchGoal, showTreeToast],
  );

  const handlePanelReviveMark = useCallback(
    async (markId: string) => {
      try {
        const res = await fetch(`/api/marks/${encodeURIComponent(markId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Restore failed (${res.status})`) };
        }
        await loadData({ silent: true });
        showTreeToast("Mark restored to your map.");
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while restoring mark." };
      }
    },
    [loadData, showTreeToast],
  );

  const handlePanelUpdateGoal = useCallback(
    async (goalId: string, body: Parameters<typeof patchGoal>[1]) => {
      const result = await patchGoal(goalId, body);
      if (result.ok) showTreeToast("Pursuit updated.");
      return result;
    },
    [patchGoal, showTreeToast],
  );

  const handlePanelMoveGoalToHub = useCallback(
    async (goalId: string, branchId: string) => {
      try {
        const target = visibleAreas.find((area) =>
          area.branches.some((branch) => branch.id === branchId),
        );
        const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}/reorganize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "moveToHub", branchId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Move failed (${res.status})`) };
        }
        if (target) setFocused(target.id);
        await loadData({ silent: true });
        showTreeToast("Pursuit moved.");
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while moving pursuit." };
      }
    },
    [loadData, showTreeToast, visibleAreas],
  );

  const handlePanelToggleSubtask = useCallback(
    async (subtaskId: string) => {
      try {
        const res = await fetch(`/api/subtasks/${encodeURIComponent(subtaskId)}/complete`, {
          method: "PATCH",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Update failed (${res.status})`) };
        }
        await loadData({ silent: true });
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while updating subtask." };
      }
    },
    [loadData],
  );

  const handlePanelAppendCanonicalTreeMilestone = useCallback(
    async (goalId: string, title: string) => {
      try {
        const res = await fetch(
          `/api/goals/${encodeURIComponent(goalId)}/milestones`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: String(err?.error ?? `Update failed (${res.status})`) };
        }
        await loadData({ silent: true });
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while adding milestone." };
      }
    },
    [loadData],
  );

  const handlePanelSetMilestoneCompletion = useCallback(
    async (goalId: string, milestoneId: string, completed: boolean) => {
      try {
        const res = await fetch(
          `/api/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(milestoneId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed }),
          },
        );
        if (!res.ok) {
          const msg = await readApiFailureMessage(
            res,
            `Update failed (${res.status})`,
            isDev,
          );
          return { ok: false, error: msg };
        }
        await loadData({ silent: true });
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error while updating milestone." };
      }
    },
    [isDev, loadData],
  );

  const handleClosePanelStream = useCallback(() => {
    if (keepStreamPreviewOnCloseRef.current) {
      keepStreamPreviewOnCloseRef.current = false;
    } else {
      clearPreviewNodes();
    }
    setPanelStreamSession(null);
    setStreamPanFocus(null);
    streamPanHubRef.current = null;
  }, [clearPreviewNodes]);

  const handlePanelStreamCommitSuccess = useCallback(() => {
    keepStreamPreviewOnCloseRef.current = true;
    prefetchMapData();
    handleStreamCommitted();
  }, [handleStreamCommitted, prefetchMapData]);

  const handlePanelStreamCommitFailed = useCallback(
    (error: string) => {
      clearPreviewNodes();
      showTreeToast(error ?? "Could not save to your map.", "#e85d5d");
    },
    [clearPreviewNodes, showTreeToast],
  );

  if (loading) {
    return (
      <div className="pf-tree-canvas h-full overflow-hidden">
        <style>{PF_TREE_CANVAS_CSS}</style>
        <div
          className="pf-tree-canvas-shell"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--pf-tree-ink-dim)",
            fontSize: 15,
          }}
        >
          Growing your tree...
        </div>
      </div>
    );
  }

  const treePanelEl =
    panel.type === "none" ? null : (
      <TreePanel
        key={treePanelKey}
        panel={panel}
        areas={visibleAreas}
        currentUserName={session?.user?.name ?? firstRun.userName}
        panelPresentation={detailRailOpen ? "rail" : "sheet"}
        panelSurface="canvas"
        onClose={clearAll}
        onOpenArea={handleAreaClick}
        onOpenHub={handleHubClick}
        onOpenThemeStream={handleOpenThemeStream}
        onOpenHubStream={handleOpenHubStream}
        onOpenGoalStream={handleOpenGoalStream}
        panelStreamSession={panelStreamSession}
        onCloseStream={handleClosePanelStream}
        onStreamCommitSuccess={handlePanelStreamCommitSuccess}
        onStreamCommitFailed={handlePanelStreamCommitFailed}
        onStreamExtracted={prefetchMapData}
        onStreamClearPreview={clearPreviewNodes}
        onStreamCardFocusHub={handleStreamCardFocusHub}
        onStreamOnboardingFirstCardConfirmed={handleOnboardingFirstCardConfirmed}
        editMapMode={editMapMode}
        onDeleteGoal={handlePanelDeleteGoal}
        archivedGoals={archivedGoals}
        archivedMarks={archivedMarks}
        onReviveGoal={handlePanelReviveGoal}
        onReviveMark={handlePanelReviveMark}
        onUpdateGoal={handlePanelUpdateGoal}
        onMoveGoalToHub={handlePanelMoveGoalToHub}
        onToggleSubtask={handlePanelToggleSubtask}
        onAppendCanonicalTreeMilestone={handlePanelAppendCanonicalTreeMilestone}
        onSetMilestoneCompletion={handlePanelSetMilestoneCompletion}
        onAddGoal={handleAddGoalOnHub}
        onNavigateToGoal={handleNavigateToGoal}
        onSparseEnriched={handleSparseEnriched}
        themeUnlockBanner={recentlyUnlockedLimbId}
        apiBranchRows={apiBranchRows}
        onActivateHub={handleActivateHubFromPanel}
      />
    );

  const detailRailWidthPx = panel?.type === "goal" ? 480 : TREE_DETAIL_RAIL_WIDTH_PX;

  return (
    <div
      className="pf-tree-canvas h-full overflow-hidden"
      style={{
        pointerEvents: onboardingLocked && !isOnboardingGuideActive ? "none" : undefined,
        opacity: onboardingLocked && !isOnboardingGuideActive ? 0 : 1,
      }}
    >
      <style>{PF_TREE_CANVAS_CSS}</style>
      <div className="pf-tree-canvas-shell">
        <div className="pf-tree-canvas-stage">
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
            }}
          >
            {mapViews}
          </div>

          <TreeCanvasHud
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showElementGuide={showTreeElementGuide}
            onShowElementGuideChange={setShowTreeElementGuide}
            showElementGuideToggle={TREE_ELEMENT_GUIDE_ENABLED}
            editMapMode={editMapMode}
            editMapPendingCount={editMapPendingOps.length}
            onEditMapToggle={() => {
              if (editMapMode) {
                requestExitEditMap();
                return;
              }
              clearEditMapDraft();
              setEditMapMode(true);
            }}
            editMapDisabled={Boolean(panelStreamSession)}
          />

          {viewMode === "tree" && activatingLimbId ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                bottom: 88,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 28,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 999,
                border: `1px solid ${getLifeArea(activatingLimbId)?.color ?? "#7B68C8"}55`,
                background: "rgba(11, 10, 15, 0.92)",
                color: "rgba(255, 255, 255, 0.88)",
                fontSize: 14,
                fontWeight: 500,
                boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: getLifeArea(activatingLimbId)?.color ?? "#7B68C8",
                  boxShadow: `0 0 10px ${getLifeArea(activatingLimbId)?.color ?? "#7B68C8"}`,
                  animation: "pulse-ring 1.1s ease-in-out infinite",
                }}
              />
              Adding{" "}
              {TREE_THEME_SHORT_LABEL[activatingLimbId] ??
                getLifeArea(activatingLimbId)?.label ??
                activatingLimbId}{" "}
              to your map…
            </div>
          ) : null}

          {detailRailOpen ? (
            <aside
              role="complementary"
              aria-label={detailRailLabel}
              className="pf-tree-detail-rail"
              style={{
                width: detailRailWidthPx,
                maxWidth: `min(${detailRailWidthPx}px, 92vw)`,
              }}
            >
              {treePanelEl}
            </aside>
          ) : (
            treePanelEl
          )}
        </div>
      </div>


      <TreeEditMapDoneDialog
        open={editMapExitOpen}
        ops={editMapPendingOps}
        applying={editMapApplying}
        onApply={() => void handleEditMapApply()}
        onDiscard={handleEditMapDiscard}
        onDiscussInStream={() => void handleEditMapDiscussInStream()}
        onClose={() => setEditMapExitOpen(false)}
      />

      {!FLAGS.CONVERSATIONAL_GOAL_CREATE ? (
        <AddGoalModal
          open={addGoalOpen}
          onOpenChange={(open) => {
            setAddGoalOpen(open);
            if (!open) {
              setAddGoalDefaultBranchId(null);
              setAddGoalDefaultAnchor(null);
            }
          }}
          branches={addGoalBranches}
          defaultBranchId={addGoalDefaultBranchId}
          defaultAnchor={addGoalDefaultAnchor}
          onGoalCreated={({ branchLabel }) => {
            void loadData({ silent: true });
            showTreeToast(`Pursuit created on ${branchLabel}.`);
          }}
        />
      ) : null}

      {FLAGS.CONVERSATIONAL_GOAL_CREATE && conversationalGoalCtx ? (
        <TreeConversationalGoalCreate
          context={conversationalGoalCtx}
          onClose={() => {
            setConversationalGoalCtx(null);
            setAddGoalDefaultAnchor(null);
            setAddGoalDefaultBranchId(null);
          }}
          onGoalCreated={({ branchLabel }) => {
            void loadData({ silent: true });
            showTreeToast(`Pursuit created on ${branchLabel}.`);
          }}
        />
      ) : null}

      {showFirstRunWelcome ? (
        <FirstRunWelcomeOverlay userName={firstRun.userName} onStart={handleFirstRunStart} />
      ) : null}

      {onboardingCoachMark && pendingThemeConfirm == null ? (
        <OnboardingCoachMark
          step={coachMarkStep}
          targetSelector={onboardingCoachMark.targetSelector}
          instruction={onboardingCoachMark.instruction}
          accentColor={onboardingCoachMark.accentColor}
          areaId={onboardingCoachMark.areaId}
          hubLabel={onboardingCoachMark.hubLabel}
          hubSlug={onboardingCoachMark.hubSlug}
        />
      ) : null}

      {markCardAnchor ? (
        <MarkHoverCard
          anchor={markCardAnchor}
          areas={visibleAreas}
          pinned={markPinned != null}
          onDismiss={dismissMarkCard}
          onRemoveMark={handleTimelineDeleteMoment}
          onEnriched={handleSparseEnriched}
          onResolveAmbiguous={handleResolveAmbiguousMark}
          onHoverZoneEnter={handleMarkCardHoverEnter}
          onHoverZoneLeave={handleMarkCardHoverLeave}
        />
      ) : null}

      <AddAreaModal
        open={addAreaOpen}
        dormantLimbIds={dormantLimbIds}
        onClose={() => setAddAreaOpen(false)}
        onActivated={() => {
          void loadData({ silent: true });
          showTreeToast("Area added to your tree.");
        }}
      />

      <ActivateThemeConfirmModal
        open={pendingThemeConfirm != null}
        limbId={pendingThemeConfirm}
        busy={activatingLimbId != null}
        onConfirm={() => void handleConfirmThemeUnlock()}
        onCancel={() => setPendingThemeConfirm(null)}
      />

      {treeToast ? (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 22,
            right: 22,
            zIndex: 220,
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: 360,
            padding: "11px 16px",
            borderRadius: 10,
            borderLeft: `4px solid ${treeToast.color}`,
            background: "rgba(12,11,17,0.94)",
            color: "var(--color-text-primary, #e7e5e4)",
            fontSize: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <span>{treeToast.msg}</span>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes treeGoalRailIn {
          from {
            transform: translateX(-100%);
            opacity: 0.92;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
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
        .tree-goal-bud-halo {
          animation: tree-goal-bud-halo-pulse 2.6s ease-in-out infinite;
        }
        @keyframes tree-goal-bud-halo-pulse {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
          }
        }
        .tree-goal-selected-glow {
          animation: tree-goal-selected-glow-pulse 1.75s ease-in-out infinite;
        }
        @keyframes tree-goal-selected-glow-pulse {
          0%,
          100% {
            opacity: 0.62;
          }
          50% {
            opacity: 1;
          }
        }
        .tree-goal-ambient-breathe {
          animation: tree-goal-ambient-breathe 3.8s ease-in-out infinite;
        }
        @keyframes tree-goal-ambient-breathe {
          0%,
          100% {
            opacity: 0.88;
            stroke-opacity: 0.44;
          }
          50% {
            opacity: 1;
            stroke-opacity: 1;
          }
        }
        .tree-goal-ambient-breathe-outer {
          animation: tree-goal-ambient-breathe-outer 3.8s ease-in-out infinite;
        }
        @keyframes tree-goal-ambient-breathe-outer {
          0%,
          100% {
            opacity: 0.72;
            stroke-opacity: 0.22;
          }
          50% {
            opacity: 0.95;
            stroke-opacity: 0.58;
          }
        }
      `}</style>
    </div>
  );
}
