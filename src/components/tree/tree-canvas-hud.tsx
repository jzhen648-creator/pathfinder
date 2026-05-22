"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMapIssuesCount } from "@/contexts/map-issues-count-context";
import { loadMapData } from "@/lib/load-map-data";
import type { AreaData } from "./tree-types";
import type { PanelState, ViewMode } from "./tree-view-types";
import { computeTreeMapHudStats } from "./tree-map-stats";

function issuesLabel(count: number | null): string {
  if (count != null && count > 0) return `Issues · ${count}`;
  return "Issues";
}

function selectionPill(panel: PanelState): { label: string; accent?: string; mono?: string } | null {
  if (panel.type === "hub") {
    const letter = (panel.thread.type.trim() || "H")[0]?.toUpperCase() ?? "H";
    return { label: "Hub selected", mono: `${letter} · HUB SELECTED` };
  }
  if (panel.type === "goal") {
    return { label: "Pursuit selected", mono: "PURSUIT SELECTED" };
  }
  if (panel.type === "area") {
    return { label: "Theme selected", mono: "THEME SELECTED" };
  }
  return null;
}

export function TreeCanvasHud({
  areas,
  hiddenAreaIds,
  panel,
  viewMode,
  onViewModeChange,
  showElementGuide,
  onShowElementGuideChange,
  showElementGuideToggle,
  editMapMode,
  editMapPendingCount,
  onEditMapToggle,
  editMapDisabled,
  exportingPdf,
  onExportPdf,
  focused,
  onClearFocus,
  themesOpen,
  onThemesOpenChange,
  onToggleArea,
}: {
  areas: AreaData[];
  hiddenAreaIds: ReadonlySet<string>;
  panel: PanelState;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  userName: string | null;
  showElementGuide: boolean;
  onShowElementGuideChange: (v: boolean) => void;
  showElementGuideToggle: boolean;
  editMapMode: boolean;
  editMapPendingCount: number;
  onEditMapToggle: () => void;
  editMapDisabled: boolean;
  exportingPdf: boolean;
  onExportPdf: () => void;
  focused: string | null;
  onClearFocus: () => void;
  themesOpen: boolean;
  onThemesOpenChange: (open: boolean) => void;
  onToggleArea: (areaId: string) => void;
}) {
  const { count, setCount } = useMapIssuesCount();
  const themesRef = useRef<HTMLDivElement>(null);
  const stats = computeTreeMapHudStats(areas, hiddenAreaIds);
  const sel = selectionPill(panel);

  useEffect(() => {
    if (count != null) return;
    void loadMapData().then((result) => {
      if (result.ok) setCount(result.issues.total);
    });
  }, [count, setCount]);

  useEffect(() => {
    if (!themesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (themesRef.current?.contains(e.target as Node)) return;
      onThemesOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [themesOpen, onThemesOpenChange]);

  const unresolvedPart =
    stats.unresolvedCount > 0 ? (
      <>
        {" · "}
        <strong>{stats.unresolvedCount}</strong> unresolved
      </>
    ) : null;

  return (
    <div className="pf-tree-canvas-hud" aria-hidden={false}>
      <div className="pf-tree-hud-wordmark">
        Pathfinder <span>Life map</span>
      </div>

      <div className="pf-tree-glass-panel pf-tree-hud-metrics" role="status">
        <strong>{stats.themeCount}</strong> themes · <strong>{stats.hubCount}</strong> hubs ·{" "}
        <strong>{stats.pursuitCount}</strong> pursuits
        {unresolvedPart}
      </div>

      <div className="pf-tree-hud-top-right">
        <Link
          href="/issues"
          className="pf-tree-hud-btn"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          {issuesLabel(count)}
        </Link>
        {sel ? (
          <div
            className="pf-tree-glass-panel"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontFamily: "var(--font-pf-tree-mono)",
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--pf-tree-ink-mute)",
            }}
          >
            {sel.mono ?? sel.label}
          </div>
        ) : null}
      </div>

      <div className="pf-tree-hud-tools">
        {(
          [
            { id: "tree" as const, label: "Tree" },
            { id: "timeline" as const, label: "Timeline" },
            { id: "branch" as const, label: "Branch" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pf-tree-hud-btn${viewMode === opt.id ? " is-active" : ""}`}
            onClick={() => onViewModeChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
        {viewMode === "tree" ? (
          <button
            type="button"
            className={`pf-tree-hud-btn${editMapMode ? " is-active" : ""}`}
            disabled={editMapDisabled}
            onClick={onEditMapToggle}
          >
            {editMapMode
              ? editMapPendingCount > 0
                ? `Done editing (${editMapPendingCount})`
                : "Done editing"
              : "Edit map"}
          </button>
        ) : null}
        {showElementGuideToggle ? (
          <label
            className="pf-tree-hud-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={showElementGuide}
              onChange={(e) => onShowElementGuideChange(e.target.checked)}
              style={{ margin: 0 }}
            />
            Labels
          </label>
        ) : null}
        <button type="button" className="pf-tree-hud-btn" disabled={exportingPdf} onClick={onExportPdf}>
          {exportingPdf ? "Exporting…" : "Export PDF"}
        </button>
        {focused ? (
          <button type="button" className="pf-tree-hud-btn" onClick={onClearFocus}>
            Exit focus
          </button>
        ) : null}
      </div>

      <div ref={themesRef} style={{ position: "absolute", bottom: 18, right: 16, zIndex: 26 }}>
        <button
          type="button"
          className="pf-tree-hud-btn"
          onClick={() => onThemesOpenChange(!themesOpen)}
          aria-expanded={themesOpen}
        >
          Themes
        </button>
        {themesOpen ? (
          <div className="pf-tree-glass-panel pf-tree-theme-drawer" style={{ marginTop: 8 }}>
            <div
              style={{
                fontFamily: "var(--font-pf-tree-mono)",
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--pf-tree-ink-mute)",
                padding: "4px 8px 8px",
              }}
            >
              Show on map
            </div>
            {areas.map((area) => {
              const off = hiddenAreaIds.has(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  className={`pf-tree-theme-toggle${off ? " is-off" : ""}`}
                  onClick={() => onToggleArea(area.id)}
                >
                  <span className="pf-tree-theme-dot" style={{ background: area.color }} />
                  <span style={{ flex: 1 }}>{area.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
