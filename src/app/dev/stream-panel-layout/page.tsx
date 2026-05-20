"use client";

import { useCallback, useMemo } from "react";
import { mergePreviewItemsIntoHub } from "@/components/stream/stream-hub-preview-data";
import { StreamOverlay, STREAM_PANEL_WIDTH_PX } from "@/components/stream/stream-overlay";
import { createCareerHubDevBaseThread } from "@/components/stream/stream-preview-fixtures";
import { TreeSVG } from "@/components/tree/tree-svg";
import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";
import type { StreamHubUiContext } from "@/types/stream";

const DEV_AREA_ID = "work";
const DEV_BRANCH_ID = "dev-career-hub";
const ACCENT = "#c9a227";

/** Dev-only: Part 1 layout check — full TreeSVG + side Stream panel + scrim (no auth). */
export default function StreamPanelLayoutDevPage() {
  const areas = useMemo(() => {
    const base = createCareerHubDevBaseThread(DEV_BRANCH_ID);
    const { area } = mergePreviewItemsIntoHub(
      base,
      { marks: [], pursuits: [], milestones: [] },
      { id: DEV_AREA_ID, label: "Work", color: ACCENT },
    );
    return [area];
  }, []);

  const hub = useMemo<StreamHubUiContext>(
    () => ({
      branchId: DEV_BRANCH_ID,
      areaId: DEV_AREA_ID,
      branchLabel: "Career",
      areaLabel: "Work",
      areaColor: ACCENT,
      existingGoals: areas[0]?.branches[0]?.goals.map((g) => ({ id: g.id, title: g.title })) ?? [],
    }),
    [areas],
  );

  const noop = useCallback(() => {}, []);

  return (
    <div
      className="pf-roadmap"
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#111210",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PF_ROADMAP_THEME_CSS }} />
      <TreeSVG
        areas={areas}
        allAreasForForkGeometry={areas}
        focused={DEV_AREA_ID}
        focusedLimbId={null}
        onToggleLimbFocus={noop}
        panel={{ type: "none" }}
        onClear={noop}
        onAreaClick={noop}
        onHubClick={noop}
        onMarkClick={noop}
        onGoalClick={noop}
      />
      <div
        aria-hidden
        data-stream-tree-scrim="1"
        style={{
          position: "fixed",
          inset: 0,
          right: STREAM_PANEL_WIDTH_PX,
          background: "rgba(0,0,0,0.3)",
          pointerEvents: "none",
          zIndex: 199990,
        }}
      />
      <StreamOverlay
        mode="hub"
        hub={hub}
        embed
        initialDraft="Promoted last March. Working toward Head of Product and updating my LinkedIn."
        onClose={noop}
        onCommitted={noop}
      />
    </div>
  );
}
