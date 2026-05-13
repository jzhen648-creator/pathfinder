"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { AddGoalModal } from "@/components/goals/add-goal-modal";
import { TreeConversationalGoalCreate } from "@/components/tree/tree-conversational-goal-create";
import { PfChromeTopbar, PfChromeViewsNav } from "@/components/shell/pf-chrome";
import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import { FLAGS } from "@/lib/flags";
import { mapToTreeData } from "./tree-data";
import type { AreaData, MomentNode, TreeGoalNode } from "./tree-types";
import type { TreeRenderQuality } from "./tree-render-quality";
import { TreeSVG } from "./tree-svg";
import { TimelineView, BranchView } from "./tree-alternate-views";
import { TreePanel } from "./tree-panel";
import {
  normalizeBranches,
  normalizeGoalsFromBranches,
  normalizeMarks,
} from "./tree-view-normalize";
import { countRoadmapGoalsInArea, findGoalInAreas } from "./tree-view-goal-queries";
import {
  MOCK_USER_STORAGE_KEY,
  TREE_ELEMENT_GUIDE_ENABLED,
  TREE_MAP_SURFACE_FILL,
  TREE_RENDER_QUALITY_DEV_STORAGE_KEY,
} from "./tree-view-constants";
import {
  type AddGoalHubContext,
  type BranchesResponse,
  type MarksResponse,
  type MockUserOption,
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

export function TreeView() {
  const isDev = process.env.NODE_ENV === "development";
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [focusedLimbId, setFocusedLimbId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ type: "none" });
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [hiddenAreaIds, setHiddenAreaIds] = useState<Set<string>>(() => new Set());
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [mockUsers, setMockUsers] = useState<MockUserOption[]>([]);
  const [selectedMockUserId, setSelectedMockUserId] = useState<string | null>(null);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addGoalDefaultBranchId, setAddGoalDefaultBranchId] = useState<string | null>(null);
  const [conversationalGoalCtx, setConversationalGoalCtx] = useState<AddGoalHubContext | null>(null);
  const [treeToast, setTreeToast] = useState<{ msg: string; color: string } | null>(null);
  const [resettingProfiles, setResettingProfiles] = useState(false);

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

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const userQuery = isDev && selectedMockUserId ? `?userId=${encodeURIComponent(selectedMockUserId)}` : "";
      const [marksRes, branchesRes] = await Promise.all([
        fetch(`/api/marks${userQuery}`, { cache: "no-store" }),
        fetch(`/api/branches${userQuery}`, { cache: "no-store" }),
      ]);
      const marksJson = (await marksRes.json()) as MarksResponse;
      const branchesJson = (await branchesRes.json()) as BranchesResponse;
      const marks = normalizeMarks(marksJson);
      const branches = normalizeBranches(branchesJson);
      const goals = normalizeGoalsFromBranches(branchesJson);
      setAreas(mapToTreeData(branches, marks, goals));
    } catch (err) {
      console.error("[tree-view] loadData failed", err);
      setAreas([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isDev, selectedMockUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const handleAddGoalOnHub = useCallback((hub: AddGoalHubContext) => {
    setAddGoalDefaultBranchId(hub.branchId);
    if (FLAGS.CONVERSATIONAL_GOAL_CREATE) {
      setConversationalGoalCtx({
        ...hub,
        anchorClient: {
          x: window.innerWidth / 2,
          y: Math.min(window.innerHeight - 100, window.innerHeight * 0.5),
        },
      });
      return;
    }
    setAddGoalOpen(true);
  }, []);

  const handleMomentClick = useCallback((moment: MomentNode, area: AreaData) => {
    setFocused(area.id);
    setPanel({ type: "moment", moment, area });
  }, []);

  const handleGoalClick = useCallback((goal: TreeGoalNode, area: AreaData) => {
    let close = false;
    setPanel((curr) => {
      close = curr.type === "goal" && curr.goal.id === goal.id;
      return close ? { type: "none" } : { type: "goal", goal, area };
    });
    setFocused(close ? null : area.id);
  }, []);

  const visibleAreas = useMemo(
    () => areas.filter((area) => !hiddenAreaIds.has(area.id)),
    [areas, hiddenAreaIds],
  );

  const handleNavigateToGoal = useCallback(
    (goalId: string) => {
      const found = findGoalInAreas(visibleAreas, goalId);
      if (!found) return;
      setFocused(found.area.id);
      setPanel({ type: "goal", goal: found.goal, area: found.area });
    },
    [visibleAreas],
  );

  const allThreads = useMemo(
    () => visibleAreas.flatMap((area) => area.branches.map((thread) => ({ area, thread }))),
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

  const addGoalBranches = useMemo(
    () =>
      areas.flatMap((area) =>
        area.branches.map((branchRow) => ({
          id: branchRow.id,
          lifeAreaId: area.id,
          label: branchRow.type,
        })),
      ),
    [areas],
  );

  const showTreeToast = useCallback((msg: string, color = "#7B68C8") => {
    setTreeToast({ msg, color });
    window.setTimeout(() => setTreeToast(null), 2400);
  }, []);

  const handleContinueGoal = useCallback(
    async (goalId: string, body: { title: string }) => {
      try {
        const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; goal?: { id?: string } };
        if (!res.ok) {
          return { ok: false, error: String(data.error ?? `Could not continue goal (${res.status})`) };
        }
        const newGoalId = typeof data.goal?.id === "string" ? data.goal.id : undefined;
        window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
        await loadData({ silent: true });
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        showTreeToast("Related goal created.");
        return { ok: true, newGoalId };
      } catch {
        return { ok: false, error: "Network error while continuing goal." };
      }
    },
    [loadData, showTreeToast],
  );

  const handleResetDemoProfiles = useCallback(async () => {
    if (!isDev) return;
    if (
      !window.confirm(
        "Reset demo profiles 1 and 2 (fulltree@ / mygoals@ pathfinder.test) to fresh seed data? This replaces branches, marks, and goals for those users.",
      )
    ) {
      return;
    }
    setResettingProfiles(true);
    try {
      const res = await fetch("/api/dev/reset-tree-profiles", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        showTreeToast(data.error ?? "Reset failed", "#f87171");
        return;
      }
      showTreeToast("Demo profiles reset to fresh seed.");
      window.dispatchEvent(new Event(PATHFINDER_GOALS_CHANGED_EVENT));
      await loadData();
    } catch {
      showTreeToast("Reset request failed.", "#f87171");
    } finally {
      setResettingProfiles(false);
    }
  }, [isDev, loadData, showTreeToast]);

  useEffect(() => {
    const h = () => {
      void loadData({ silent: true });
    };
    window.addEventListener(PATHFINDER_GOALS_CHANGED_EVENT, h);
    return () => window.removeEventListener(PATHFINDER_GOALS_CHANGED_EVENT, h);
  }, [loadData]);

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
  const [showTreeElementGuide, setShowTreeElementGuide] = useState(false);
  const [treeRenderQualityDevPreset, setTreeRenderQualityDevPreset] = useState<TreeRenderQuality | null>(null);

  useEffect(() => {
    if (!isDev) return;
    const raw = window.localStorage.getItem(TREE_RENDER_QUALITY_DEV_STORAGE_KEY);
    if (raw === "restrained" || raw === "balanced" || raw === "cinematic") {
      setTreeRenderQualityDevPreset(raw);
    }
  }, [isDev]);

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

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#0f0f0f",
          color: "#94a3b8",
          fontSize: 16,
        }}
      >
        Growing your tree...
      </div>
    );
  }

  const detailRailOpen = panel.type === "goal" || panel.type === "hub" || panel.type === "area";
  const detailRailLabel =
    panel.type === "hub" ? "Hub details" : panel.type === "area" ? "Theme details" : "Goal details";
  const treePanelKey =
    panel.type === "goal"
      ? `goal-${panel.goal.id}`
      : panel.type === "area"
        ? `area-${panel.area.id}`
        : panel.type === "hub"
          ? `hub-${panel.thread.id}`
          : panel.type === "moment"
            ? `moment-${panel.moment.id}`
            : "none";

  const mapViews = (
    <>
      {viewMode === "tree" ? (
        <TreeSVG
          areas={visibleAreas}
          allAreasForForkGeometry={areas}
          focused={focused}
          focusedLimbId={focusedLimbId}
          onToggleLimbFocus={onToggleLimbFocus}
          panel={panel}
          onClear={clearAll}
          onAreaClick={handleAreaClick}
          onHubClick={handleHubClick}
          onMomentClick={handleMomentClick}
          onGoalClick={handleGoalClick}
          exportRootRef={treeExportRootRef}
          showElementGuide={TREE_ELEMENT_GUIDE_ENABLED && showTreeElementGuide}
          renderQualityDevPreset={isDev ? treeRenderQualityDevPreset : null}
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
      {viewMode === "branch" ? (
        <BranchView
          areas={visibleAreas}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
          onMomentClick={handleMomentClick}
          focused={focused}
          onAreaClick={handleAreaClick}
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
        onClose={clearAll}
        onOpenArea={handleAreaClick}
        onOpenHub={handleHubClick}
        onDeleteGoal={async (goalId) => {
          try {
            const userQuery =
              isDev && selectedMockUserId ? `?userId=${encodeURIComponent(selectedMockUserId)}` : "";
            const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}${userQuery}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              return { ok: false, error: String(err?.error ?? `Delete failed (${res.status})`) };
            }
            await loadData({ silent: true });
            setPanel({ type: "none" });
            showTreeToast("Goal deleted.");
            return { ok: true };
          } catch {
            return { ok: false, error: "Network error while deleting goal." };
          }
        }}
        onUpdateGoal={async (goalId, body) => {
          try {
            const userQuery =
              isDev && selectedMockUserId ? `?userId=${encodeURIComponent(selectedMockUserId)}` : "";
            const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}${userQuery}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              return { ok: false, error: String(err?.error ?? `Update failed (${res.status})`) };
            }
            window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
            await loadData({ silent: true });
            showTreeToast("Goal updated.");
            return { ok: true };
          } catch {
            return { ok: false, error: "Network error while updating goal." };
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
            const userQuery =
              isDev && selectedMockUserId ? `?userId=${encodeURIComponent(selectedMockUserId)}` : "";
            const res = await fetch(
              `/api/goals/${encodeURIComponent(goalId)}/milestones${userQuery}`,
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
            const userQuery =
              isDev && selectedMockUserId ? `?userId=${encodeURIComponent(selectedMockUserId)}` : "";
            const res = await fetch(
              `/api/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(milestoneId)}${userQuery}`,
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
        onNavigateToGoal={handleNavigateToGoal}
        onContinueGoal={handleContinueGoal}
      />
    );

  return (
    <div className="pf-roadmap min-h-dvh overflow-hidden text-(--rm-text1)">
      <style>{PF_ROADMAP_THEME_CSS}</style>
      <div className="pf-roadmap-shell bg-(--rm-canvas)">
        <PfChromeTopbar shell="roadmap" avatarInitials="PF" avatarTitle="Profile" />
        <aside className="rm-sidebar">
          <PfChromeViewsNav shell="roadmap" />
          <div className="rm-sidebar-divider" />
          <div className="mb-1.5 px-5 text-[10px] font-medium uppercase tracking-wider text-(--rm-text3)">
            Themes
          </div>
          {areas.map((area) => {
            const off = hiddenAreaIds.has(area.id);
            return (
              <button
                key={area.id}
                type="button"
                className={`rm-tree-toggle${off ? " rm-off" : ""}`}
                title={`${countRoadmapGoalsInArea(area)} roadmap goals in this theme`}
                onClick={() => toggleArea(area.id)}
              >
                <div className="rm-tree-dot" style={{ background: area.color }} />
                <span className="rm-tree-name">{area.label}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-(--rm-text3)">
                  {countRoadmapGoalsInArea(area)}
                </span>
                <div className="rm-toggle-pill" />
              </button>
            );
          })}
        </aside>

        <main className="rm-main" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{
              padding: "10px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-primary)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: ".1em",
                color: "var(--color-text-tertiary)",
              }}
            >
              TREE VIEW
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {TREE_ELEMENT_GUIDE_ENABLED ? (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showTreeElementGuide}
                    onChange={(e) => setShowTreeElementGuide(e.target.checked)}
                  />
                  Element labels
                </label>
              ) : null}
              {([
                { id: "tree", label: "Tree" },
                { id: "timeline", label: "Timeline" },
                { id: "branch", label: "Branch" },
              ] as const).map((opt) => {
                const active = viewMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setViewMode(opt.id)}
                    style={{
                      fontSize: 13,
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
                  fontSize: 13,
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
                    fontSize: 14,
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
              ) : isDev && mockUsers.length > 0 ? (
                <label
                  htmlFor="tree-view-dev-profile"
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-tertiary)",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  Profile
                </label>
              ) : null}
              {isDev && viewMode === "tree" ? (
                <>
                  <label
                    htmlFor="tree-view-dev-render-quality"
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-tertiary)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    Render
                  </label>
                  <select
                    id="tree-view-dev-render-quality"
                    value={treeRenderQualityDevPreset ?? "__flag__"}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__flag__") {
                        setTreeRenderQualityDevPreset(null);
                        window.localStorage.removeItem(TREE_RENDER_QUALITY_DEV_STORAGE_KEY);
                        return;
                      }
                      const preset = v as TreeRenderQuality;
                      setTreeRenderQualityDevPreset(preset);
                      window.localStorage.setItem(TREE_RENDER_QUALITY_DEV_STORAGE_KEY, preset);
                    }}
                    aria-label="Tree goal render quality preset"
                    style={{
                      fontSize: 14,
                      lineHeight: 1.2,
                      color: "var(--color-text-secondary)",
                      background: "none",
                      border: "0.5px solid var(--color-border-secondary)",
                      borderRadius: 4,
                      padding: "3px 10px",
                      cursor: "pointer",
                      minHeight: 28,
                      maxWidth: 160,
                    }}
                  >
                    <option value="__flag__">Flag default</option>
                    <option value="restrained">Restrained</option>
                    <option value="balanced">Balanced</option>
                    <option value="cinematic">Cinematic</option>
                  </select>
                </>
              ) : null}
              {isDev && mockUsers.length > 0 ? (
                <select
                  id="tree-view-dev-profile"
                  value={selectedMockUserId ?? mockUsers[0]?.id ?? ""}
                  onChange={(e) => setSelectedMockUserId(e.target.value)}
                  aria-label="Select profile to preview"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.2,
                    color: "var(--color-text-secondary)",
                    background: "none",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 4,
                    padding: "3px 10px",
                    cursor: "pointer",
                    minHeight: 28,
                    maxWidth: 220,
                  }}
                >
                  {mockUsers.map((user) => (
                    <option key={user.id} value={user.id} title={user.email}>
                      {user.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {isDev && mockUsers.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleResetDemoProfiles()}
                  disabled={resettingProfiles}
                  aria-label="Reset demo profiles to fresh seed data"
                  style={{
                    fontSize: 13,
                    lineHeight: 1,
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "0.5px solid var(--color-border-secondary)",
                    color: "var(--color-text-secondary)",
                    background: "transparent",
                    cursor: resettingProfiles ? "wait" : "pointer",
                    opacity: resettingProfiles ? 0.65 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {resettingProfiles ? "Resetting…" : "Reset profiles"}
                </button>
              ) : null}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
              {mapViews}
            </div>
            {detailRailOpen ? (
              <aside
                role="complementary"
                aria-label={detailRailLabel}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 360,
                  maxWidth: "min(360px, 100%)",
                  zIndex: 30,
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--rm-bgEl, var(--color-background-primary))",
                  boxShadow: "10px 0 28px rgba(0,0,0,0.2)",
                  overflow: "hidden",
                  animation: "treeGoalRailIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
                }}
              >
                {treePanelEl}
              </aside>
            ) : (
              treePanelEl
            )}
          </div>
        </main>
      </div>

      {!FLAGS.CONVERSATIONAL_GOAL_CREATE ? (
        <AddGoalModal
          open={addGoalOpen}
          onOpenChange={(open) => {
            setAddGoalOpen(open);
            if (!open) setAddGoalDefaultBranchId(null);
          }}
          branches={addGoalBranches}
          defaultBranchId={addGoalDefaultBranchId}
          devGoalsUserId={isDev ? selectedMockUserId : null}
          onGoalCreated={({ branchLabel }) => {
            showTreeToast(`Goal created on ${branchLabel}.`);
          }}
        />
      ) : null}

      {FLAGS.CONVERSATIONAL_GOAL_CREATE && conversationalGoalCtx ? (
        <TreeConversationalGoalCreate
          context={conversationalGoalCtx}
          isDev={isDev}
          devGoalsUserId={selectedMockUserId}
          onClose={() => setConversationalGoalCtx(null)}
          onGoalCreated={({ branchLabel }) => {
            showTreeToast(`Goal created on ${branchLabel}.`);
          }}
        />
      ) : null}

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
      `}</style>
    </div>
  );
}
