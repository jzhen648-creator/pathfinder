"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { AddGoalModal } from "@/components/goals/add-goal-modal";
import { PfChromeTopbar, PfChromeViewsNav } from "@/components/shell/pf-chrome";
import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import { mapToTreeData } from "./tree-data";
import type { AreaData, MomentNode, TreeGoalNode } from "./tree-types";
import { TreeSVG } from "./tree-svg";
import { TimelineView, BranchView } from "./tree-alternate-views";
import { TreePanel } from "./tree-panel";
import {
  normalizeBranches,
  normalizeGoalsFromBranches,
  normalizeMarks,
} from "./tree-view-normalize";
import { countRoadmapGoalsInArea } from "./tree-view-goal-queries";
import { MOCK_USER_STORAGE_KEY, TREE_ELEMENT_GUIDE_ENABLED } from "./tree-view-constants";
import type {
  BranchesResponse,
  MarksResponse,
  MockUserOption,
  PanelState,
  ViewMode,
} from "./tree-view-types";

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
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addGoalDefaultBranchId, setAddGoalDefaultBranchId] = useState<string | null>(null);
  const [treeToast, setTreeToast] = useState<{ msg: string; color: string } | null>(null);

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

  const handleAddGoalPlaceholderClick = useCallback((threadId: string) => {
    setFocused(null);
    setPanel({ type: "none" });
    setSelectedThreadId(threadId);
    setAddGoalDefaultBranchId(threadId);
    setAddGoalOpen(true);
  }, []);

  const handleMomentClick = useCallback((moment: MomentNode, area: AreaData) => {
    setFocused(area.id);
    setPanel({ type: "moment", moment, area });
  }, []);

  const handleGoalClick = useCallback((goal: TreeGoalNode, area: AreaData) => {
    setFocused(area.id);
    setPanel({ type: "goal", goal, area });
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

  useEffect(() => {
    const h = () => {
      void loadData();
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
                title={`${countRoadmapGoalsInArea(area)} roadmap goals in this area`}
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
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {TREE_ELEMENT_GUIDE_ENABLED ? (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
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
                  aria-label="Dev mock user"
                  style={{
                    fontSize: 12,
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
              allAreasForForkGeometry={areas}
              focused={focused}
              panel={panel}
              onClear={clearAll}
              onAreaClick={handleAreaClick}
              onAddGoalPlaceholderClick={handleAddGoalPlaceholderClick}
              onMomentClick={handleMomentClick}
              onGoalClick={handleGoalClick}
              onFoundationsClick={handleFoundationsClick}
              exportRootRef={treeExportRootRef}
              showElementGuide={TREE_ELEMENT_GUIDE_ENABLED && showTreeElementGuide}
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

          {panel.type !== "none" && (
            <TreePanel
              panel={panel}
              areas={visibleAreas}
              onClose={clearAll}
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
                  await loadData();
                  clearAll();
                  showTreeToast("Goal deleted.");
                  return { ok: true };
                } catch {
                  return { ok: false, error: "Network error while deleting goal." };
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
                  await loadData();
                  return { ok: true };
                } catch {
                  return { ok: false, error: "Network error while updating subtask." };
                }
              }}
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
              onAddGoal={() => {
                setAddGoalDefaultBranchId(null);
                setAddGoalOpen(true);
              }}
            />
          )}
        </main>
      </div>

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
            fontSize: 13,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <span>{treeToast.msg}</span>
        </div>
      ) : null}

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
        .tree-add-goal-placeholder-glow {
          animation: tree-add-goal-placeholder-pulse 2.4s ease-in-out infinite;
        }
        @keyframes tree-add-goal-placeholder-pulse {
          0%,
          100% {
            opacity: 0.35;
          }
          50% {
            opacity: 0.85;
          }
        }
      `}</style>
    </div>
  );
}
