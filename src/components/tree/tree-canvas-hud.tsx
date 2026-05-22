"use client";

import type { ViewMode } from "./tree-view-types";

export function TreeCanvasHud({
  viewMode,
  onViewModeChange,
  showElementGuide,
  onShowElementGuideChange,
  showElementGuideToggle,
  editMapMode,
  editMapPendingCount,
  onEditMapToggle,
  editMapDisabled,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showElementGuide: boolean;
  onShowElementGuideChange: (v: boolean) => void;
  showElementGuideToggle: boolean;
  editMapMode: boolean;
  editMapPendingCount: number;
  onEditMapToggle: () => void;
  editMapDisabled: boolean;
}) {
  return (
    <div className="pf-tree-canvas-hud" aria-hidden={false}>
      <div className="pf-tree-hud-tools">
        {(
          [
            { id: "tree" as const, label: "Tree" },
            { id: "timeline" as const, label: "Timeline" },
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
        <button
          type="button"
          className={`pf-tree-hud-btn${editMapMode ? " is-active" : ""}`}
          disabled={editMapDisabled}
          onClick={() => {
            if (viewMode !== "tree") onViewModeChange("tree");
            onEditMapToggle();
          }}
        >
          {editMapMode
            ? editMapPendingCount > 0
              ? `Done editing (${editMapPendingCount})`
              : "Done editing"
            : "Edit map"}
        </button>
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
      </div>
    </div>
  );
}
