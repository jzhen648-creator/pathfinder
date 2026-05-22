"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { AddGoalModal } from "@/components/goals/add-goal-modal";
import { CreateMarkModal } from "@/components/roadmap/create-mark-modal";
import { TreeConversationalGoalCreate } from "@/components/tree/tree-conversational-goal-create";
import { TreeConversationalMarkCreate } from "@/components/tree/tree-conversational-mark-create";
import { buildPreviewAreasFromNodes } from "@/components/stream/stream-hub-preview-data";
import { StreamOverlay, STREAM_PANEL_WIDTH_PX } from "@/components/stream/stream-overlay";
import { StreamPreviewProvider, useStreamPreview } from "@/contexts/stream-preview-context";
import { FirstRunWelcomeOverlay } from "@/components/onboarding/first-run-welcome-overlay";
import { findFirstRunFocusTarget, resolveFirstRunPrimaryLimbId } from "@/lib/first-run-focus";
import { getFirstRunStreamPrompt } from "@/lib/first-run-stream-prompts";
import { buildStreamHubUiFromThread, buildStreamThemeUiFromArea } from "@/lib/stream-theme-ui";
import type { LifeAreaId } from "@/lib/types";
import type { TreeFirstRunConfig } from "@/types/first-run";
import type { StreamHubUiContext, StreamThemeUiContext } from "@/types/stream";
import { TreeCanvasHud } from "@/components/tree/tree-canvas-hud";
import { PF_TREE_CANVAS_CSS, TREE_DETAIL_RAIL_WIDTH_PX } from "@/components/tree/tree-canvas-shell";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import { FLAGS } from "@/lib/flags";
import type { ApiBranchRow } from "@/lib/api-branch-row";
import type { SequenceAnchor } from "@/lib/branch-sequence";
import type { LimbId } from "@/lib/types";
import { canonicalHubDisplayLabel } from "@/lib/hub-catalog";
import { LIFE_AREA_ORDER } from "./tree-data";
import { mapToTreeData } from "./tree-data";
import { applyTreeDensity } from "./tree-density";
import { AddAreaModal } from "./add-area-modal";
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
  normalizeBranches,
  normalizeGoalsFromBranches,
  normalizeMarks,
} from "./tree-view-normalize";
import { findGoalInAreas, findMarkInAreas } from "./tree-view-goal-queries";
import {
  TREE_ELEMENT_GUIDE_ENABLED,
  TREE_MAP_SURFACE_FILL,
} from "./tree-view-constants";
import {
  type AddGoalHubContext,
  type AddMomentTreeContext,
  type ArchivedGoalRow,
  type BranchesResponse,
  type MarksResponse,
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

export function TreeView({ firstRun }: { firstRun: TreeFirstRunConfig }) {
  return (
    <StreamPreviewProvider>
      <TreeViewInner firstRun={firstRun} />
    </StreamPreviewProvider>
  );
}

function TreeViewInner({ firstRun }: { firstRun: TreeFirstRunConfig }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: refreshSession } = useSession();
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
  const [conversationalMarkCtx, setConversationalMarkCtx] = useState<AddMomentTreeContext | null>(null);
  const [streamSession, setStreamSession] = useState<
    | { mode: "hub"; hub: StreamHubUiContext; initialDraft?: string; initialPlaceholder?: string }
    | { mode: "theme"; theme: StreamThemeUiContext; initialDraft?: string; initialPlaceholder?: string }
    | null
  >(null);
  const [editMapMode, setEditMapMode] = useState(false);
  const [editMapDraftAreas, setEditMapDraftAreas] = useState<AreaData[] | null>(null);
  const [editMapPendingOps, setEditMapPendingOps] = useState<EditMapDraftOp[]>([]);
  const [editMapExitOpen, setEditMapExitOpen] = useState(false);
  const [editMapApplying, setEditMapApplying] = useState(false);
  const [apiBranchRows, setApiBranchRows] = useState<ApiBranchRow[]>([]);
  const [markModal, setMarkModal] = useState<{
    limbId: LimbId;
    branchId: string;
    anchor: SequenceAnchor | null;
  } | null>(null);
  const [treeToast, setTreeToast] = useState<{ msg: string; color: string } | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [addAreaOpen, setAddAreaOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.removeItem("pathfinder.tree.mockUserId");
      window.localStorage.removeItem("pathfinder-tree-mock-user-id");
      window.localStorage.removeItem("pathfinder_mock_density");
    } catch {
      /* ignore */
    }
  }, []);

  const loadData = useCallback(async (options?: { silent?: boolean }): Promise<AreaData[] | undefined> => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    const fetchOpts: RequestInit = { cache: "no-store", signal: AbortSignal.timeout(30_000) };
    try {
      const [marksRes, branchesRes] = await Promise.all([
        fetch("/api/marks?includeArchived=true", fetchOpts),
        fetch("/api/branches", fetchOpts),
      ]);

      const parseJson = async <T,>(res: Response, label: string): Promise<T | null> => {
        const text = await res.text();
        if (!text.trim()) {
          if (!res.ok) {
            console.error(`[tree-view] GET ${label} empty body`, { status: res.status });
          }
          return null;
        }
        try {
          return JSON.parse(text) as T;
        } catch (err) {
          console.error(`[tree-view] GET ${label} invalid JSON`, { status: res.status, err });
          return null;
        }
      };

      const marksJson = await parseJson<MarksResponse>(marksRes, "/api/marks");
      const branchesJson = await parseJson<BranchesResponse>(branchesRes, "/api/branches");

      if (!branchesRes.ok || branchesJson == null) {
        const apiErr =
          branchesJson &&
          typeof branchesJson === "object" &&
          "error" in branchesJson &&
          typeof (branchesJson as { error?: unknown }).error === "string"
            ? (branchesJson as { error: string }).error
            : null;
        const detail = apiErr ?? `Branches request failed (${branchesRes.status})`;
        console.error("[tree-view] GET /api/branches failed — tree will show trunk only", {
          status: branchesRes.status,
          detail,
        });
        setTreeToast({
          msg:
            apiErr ??
            "Could not load hubs. Stop the dev server, run npx prisma generate, restart, then sign out and sign in.",
          color: "#e85d5d",
        });
        return undefined;
      }

      const branchesPayload = branchesJson as { branches?: ApiBranchRow[] };
      setApiBranchRows(Array.isArray(branchesPayload.branches) ? branchesPayload.branches : []);
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
        if (!marksRes.ok || marksJson == null) {
          console.error("[tree-view] GET /api/marks failed — normalized list will be empty", {
            status: marksRes.status,
            body: marksJson,
          });
        } else if (FLAGS.TREE_DEBUG_MOMENT_CHAIN) {
          console.log("[tree-view] GET /api/marks → normalized marks used by tree", {
            httpOk: marksRes.ok,
            status: marksRes.status,
            count: marks.length,
            marks: marks.map((m) => ({ id: m.id, branchId: m.branchId, title: m.title ?? null })),
          });
          console.log(
            `[tree-view] confirm marks loading: count=${marks.length} (${marks.length > 0 ? "ok — data reached TreeView" : "empty — tree will show no mark-backed moments"})`,
          );
        }
      }
      const branches = normalizeBranches(branchesJson);
      const goals = normalizeGoalsFromBranches(branchesJson);
      setArchivedGoals(normalizeArchivedGoalsFromBranches(branchesJson));
      let nextAreas;
      try {
        const rawAreas = mapToTreeData(branches, marks, goals);
        nextAreas = applyTreeDensity(rawAreas, FLAGS.TREE_DENSITY);
      } catch (mapErr) {
        console.error("[tree-view] mapToTreeData failed", mapErr);
        setTreeToast({
          msg: "Tree data could not be built. Check the console and try refreshing.",
          color: "#e85d5d",
        });
        return undefined;
      }
      setAreas(nextAreas);
      if (isDev) {
        const hubSlots = nextAreas.reduce((n, a) => n + a.branches.length, 0);
        console.log("[tree-view] tree data loaded", {
          lifeAreas: nextAreas.length,
          hubSlots,
          goals: goals.length,
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
  }, [isDev]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    hoverMarksEnabledRef.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  useEffect(() => {
    const handler = () => {
      void loadData({ silent: true });
    };
    window.addEventListener("bark:saved", handler);
    return () => window.removeEventListener("bark:saved", handler);
  }, [loadData]);

  const clearAll = useCallback(() => {
    setFocused(null);
    if (FLAGS.FOCUS_MODE) setFocusedLimbId(null);
    setPanel({ type: "none" });
    setConversationalGoalCtx(null);
    setConversationalMarkCtx(null);
    setMarkHover(null);
    setMarkPinned(null);
  }, []);

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

  const handleAreaClick = useCallback((area: AreaData) => {
    setFocused(area.id);
    setPanel({ type: "area", area });
  }, []);

  const handleHubClick = useCallback((area: AreaData, thread: AreaData["branches"][number]) => {
    setFocused(area.id);
    setPanel({ type: "hub", area, thread });
  }, []);

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
        window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
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
    setPanel({ type: "none" });
    setFocusedLimbId(area.id);
    setStreamSession({ mode: "theme", theme, initialDraft: streamDraft });
  }, [
    applyEditMapSession,
    areas,
    editMapPendingOps,
    finishEditMapAfterApply,
    focused,
    showTreeToast,
  ]);

  useEffect(() => {
    if (!streamSession) return;
    setEditMapMode(false);
    setEditMapExitOpen(false);
    clearEditMapDraft();
  }, [clearEditMapDraft, streamSession]);

  const handleOpenThemeStream = useCallback((area: AreaData) => {
    const theme = buildStreamThemeUiFromArea(area);
    if (theme.hubs.length === 0) {
      showTreeToast("No hubs found for this theme — try refreshing the tree.");
      return;
    }
    setPanel({ type: "none" });
    setFocusedLimbId(area.id);
    setStreamSession({ mode: "theme", theme });
  }, [showTreeToast]);

  const handleOpenHubStream = useCallback((area: AreaData, thread: AreaData["branches"][number]) => {
    const hub = buildStreamHubUiFromThread(area, thread);
    setPanel({ type: "none" });
    setFocusedLimbId(area.id);
    setStreamSession({ mode: "hub", hub });
  }, []);

  const handleOpenGoalStream = useCallback((area: AreaData, goal: TreeGoalNode) => {
    const thread = area.branches.find((branch) => branch.id === goal.branchId);
    if (!thread) {
      showTreeToast("Could not open Stream for this pursuit — try refreshing.");
      return;
    }
    const hub = buildStreamHubUiFromThread(area, thread);
    setPanel({ type: "none" });
    setFocusedLimbId(area.id);
    setStreamSession({
      mode: "hub",
      hub,
      initialPlaceholder: `Tell me more about "${goal.title}" - add milestones, next steps, or marks from this pursuit.`,
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
    setPanel({ type: "none" });
    setFocusedLimbId(area.id);
    setStreamSession({
      mode: "theme",
      theme,
      initialPlaceholder: getFirstRunStreamPrompt(limbId as LifeAreaId),
    });
  }, [areas, showTreeToast]);

  const handleStreamCommitted = useCallback(async () => {
    const wasFirstRun = !firstRunCompletedRef.current;
    if (wasFirstRun) {
      firstRunCompletedRef.current = true;
      setFirstRunCompleted(true);
    }

    const loadedAreas = await loadData({ silent: true });

    if (wasFirstRun) {
      try {
        const res = await fetch("/api/first-run/complete", { method: "POST" });
        if (res.ok) {
          await refreshSession();
          if (loadedAreas?.length) {
            applyFirstRunFocus(loadedAreas);
          }
          showTreeToast("Your map has started.");
          return;
        }
        firstRunCompletedRef.current = false;
        setFirstRunCompleted(false);
      } catch {
        firstRunCompletedRef.current = false;
        setFirstRunCompleted(false);
      }
    }

    showTreeToast("Tree updated from your stream.");
  }, [applyFirstRunFocus, loadData, refreshSession, showTreeToast]);

  const showFirstRunWelcome =
    !firstRunCompleted && !streamSession && !loading && areas.length > 0;

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

  const handleAddMomentFromPanel = useCallback(
    (ctx: { branchId: string; areaId: string; sequenceAnchor?: SequenceAnchor | null }) => {
      const area = areas.find((a) => a.id === ctx.areaId);
      const thread = area?.branches.find((b) => b.id === ctx.branchId);
      const anchor = ctx.sequenceAnchor ?? null;
      if (FLAGS.CONVERSATIONAL_GOAL_CREATE) {
        setConversationalMarkCtx({
          branchId: ctx.branchId,
          limbId: ctx.areaId,
          branchLabel: thread?.type?.trim() || "Hub",
          areaLabel: area?.label ?? ctx.areaId,
          anchorClient: {
            x: window.innerWidth / 2,
            y: Math.min(window.innerHeight - 100, window.innerHeight * 0.45),
          },
          sequenceAnchor: anchor,
        });
        return;
      }
      setMarkModal({
        limbId: ctx.areaId as LimbId,
        branchId: ctx.branchId,
        anchor,
      });
    },
    [areas],
  );

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

  const dormantLimbIds = useMemo(() => {
    const active = new Set(
      apiBranchRows
        .filter((b) => !b.parentBranchId && b.isActive === true)
        .map((b) => b.limbId),
    );
    return LIFE_AREA_ORDER.filter((id) => !active.has(id));
  }, [apiBranchRows]);

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
        window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
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

  if (loading) {
    return (
      <div className="pf-tree-canvas">
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
          streamPanFocus={streamPanFocus}
          streamPanelWidthPx={streamSession ? STREAM_PANEL_WIDTH_PX : 0}
          editMapMode={editMapMode && !streamSession}
          editMapDraftAreas={editMapDraftAreas}
          onEditMapDraftDrop={handleEditMapDraftDrop}
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

  const treePanelEl =
    panel.type === "none" ? null : (
      <TreePanel
        key={treePanelKey}
        panel={panel}
        areas={visibleAreas}
        panelPresentation={detailRailOpen ? "rail" : "sheet"}
        panelSurface="canvas"
        onClose={clearAll}
        onOpenArea={handleAreaClick}
        onOpenHub={handleHubClick}
        onOpenThemeStream={handleOpenThemeStream}
        onOpenHubStream={handleOpenHubStream}
        onOpenGoalStream={handleOpenGoalStream}
        editMapMode={editMapMode}
        onDeleteGoal={async (goalId) => {
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
        }}
        archivedGoals={archivedGoals}
        archivedMarks={archivedMarks}
        onReviveGoal={async (goalId) => {
          const result = await patchGoal(goalId, { archived: false });
          if (result.ok) showTreeToast("Pursuit restored to your map.");
          return result;
        }}
        onReviveMark={async (markId) => {
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
        }}
        onUpdateGoal={async (goalId, body) => {
          const result = await patchGoal(goalId, body);
          if (result.ok) showTreeToast("Pursuit updated.");
          return result;
        }}
        onMoveGoalToHub={async (goalId, branchId) => {
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
            window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
            await loadData({ silent: true });
            showTreeToast("Pursuit moved.");
            return { ok: true };
          } catch {
            return { ok: false, error: "Network error while moving pursuit." };
          }
        }}
        onToggleSubtask={async (subtaskId) => {
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
        }}
        onAppendCanonicalTreeMilestone={async (goalId, title) => {
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
            window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
            await loadData({ silent: true });
            return { ok: true };
          } catch {
            return { ok: false, error: "Network error while adding milestone." };
          }
        }}
        onSetMilestoneCompletion={async (goalId, milestoneId, completed) => {
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
            window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
            await loadData({ silent: true });
            return { ok: true };
          } catch {
            return { ok: false, error: "Network error while updating milestone." };
          }
        }}
        onAddGoal={handleAddGoalOnHub}
        onAddMoment={handleAddMomentFromPanel}
        onNavigateToGoal={handleNavigateToGoal}
        onSparseEnriched={handleSparseEnriched}
      />
    );

  const detailRailWidthPx = panel?.type === "goal" ? 480 : TREE_DETAIL_RAIL_WIDTH_PX;

  return (
    <div className="pf-tree-canvas min-h-dvh overflow-hidden">
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
            editMapDisabled={Boolean(streamSession)}
          />

          {viewMode === "tree" && dormantLimbIds.length > 0 ? (
            <button
              type="button"
              className="pf-tree-hud-btn"
              style={{
                position: "absolute",
                bottom: 72,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 26,
              }}
              onClick={() => setAddAreaOpen(true)}
            >
              Add another area
            </button>
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

      {streamSession ? (
        <div
          aria-hidden
          data-stream-tree-scrim="1"
          style={{
            position: "fixed",
            inset: 0,
            right: STREAM_PANEL_WIDTH_PX,
            background: "rgba(0,0,0,0.4)",
            pointerEvents: "none",
            zIndex: 199990,
          }}
        />
      ) : null}

      {showFirstRunWelcome ? (
        <FirstRunWelcomeOverlay userName={firstRun.userName} onStart={handleFirstRunStart} />
      ) : null}

      {streamSession ? (
        <StreamOverlay
          {...(streamSession.mode === "theme"
            ? { mode: "theme" as const, theme: streamSession.theme }
            : { mode: "hub" as const, hub: streamSession.hub })}
          initialDraft={streamSession.initialDraft}
          initialPlaceholder={streamSession.initialPlaceholder}
          onCardFocusHub={handleStreamCardFocusHub}
          onClose={() => {
            clearPreviewNodes();
            setStreamSession(null);
            setStreamPanFocus(null);
            streamPanHubRef.current = null;
          }}
          onClearPreview={clearPreviewNodes}
          onCommitted={() => {
            void handleStreamCommitted();
          }}
          onExtracted={() => {
            void loadData({ silent: true });
          }}
        />
      ) : null}

      {FLAGS.CONVERSATIONAL_GOAL_CREATE && conversationalMarkCtx ? (
        <TreeConversationalMarkCreate
          context={conversationalMarkCtx}
          onClose={() => setConversationalMarkCtx(null)}
          onMarkCreated={() => {
            void loadData({ silent: true });
            showTreeToast("Mark added.");
          }}
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

      {markModal ? (
        <CreateMarkModal
          open
          onClose={() => setMarkModal(null)}
          branches={apiBranchRows}
          defaultLifeAreaId={markModal.limbId}
          defaultBranchId={markModal.branchId}
          defaultAnchor={markModal.anchor}
          onCreated={async () => {
            await loadData({ silent: true });
            showTreeToast("Mark added.");
          }}
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
