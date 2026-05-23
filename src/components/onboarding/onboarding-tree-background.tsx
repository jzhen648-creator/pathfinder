"use client";

import { useCallback } from "react";

import { TreeSVG } from "@/components/tree/tree-svg";
import type { AreaData, MomentNode, TreeGoalNode } from "@/components/tree/tree-types";
import { PF_TREE_CANVAS_CSS } from "@/components/tree/tree-canvas-shell";
import type {
  OnboardingHubPickMode,
  TreeCameraFrame,
} from "@/components/tree/tree-view-types";
import type { LifeAreaId } from "@/lib/types";

export type OnboardingTreeBackgroundProps = {
  areas: AreaData[];
  dormantLimbIds?: readonly LifeAreaId[];
  unlockedLimbIds?: readonly LifeAreaId[];
  activatingLimbId?: LifeAreaId | null;
  onAreaClick?: (area: AreaData) => void;
  previewAreas?: AreaData[];
  /** Disable all pointer events — use for a purely decorative backdrop. */
  nonInteractive?: boolean;
  /** Focus one theme on first paint (Scene 6 reveal). */
  focusedLimbId?: string | null;
  initialFitAreaIds?: readonly string[];
  initialFitPaddingPx?: number;
  initialFitIncludePreviewBranchTips?: boolean;
  highlightGoalId?: string | null;
  streamPanFocus?: { areaId: string; branchId: string; key: number } | null;
  /** Onboarding Scene 3 — enhanced ghost hubs on the tree. */
  onboardingHubPick?: OnboardingHubPickMode;
  /** Full gateway medallion layout for empty themes (default true in onboarding). */
  previewGatewayLayout?: boolean;
  /** Onboarding-only camera sync for HTML callout overlays. */
  onCameraFrame?: (frame: TreeCameraFrame) => void;
};

function noop() {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function noopMoment(_m: MomentNode, _a: AreaData, _x: number, _y: number) {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function noopGoal(_g: TreeGoalNode, _a: AreaData) {}

/**
 * Full-screen tree canvas for use as an onboarding scene backdrop.
 * Stubs all tree-view interactivity except optional `onAreaClick` (used in Scene 2).
 * Renders via existing DormantPulse / GhostPulse / live visual state system.
 */
export function OnboardingTreeBackground({
  areas,
  dormantLimbIds,
  unlockedLimbIds,
  activatingLimbId,
  onAreaClick,
  previewAreas,
  nonInteractive = false,
  focusedLimbId = null,
  initialFitAreaIds,
  initialFitPaddingPx,
  initialFitIncludePreviewBranchTips,
  highlightGoalId = null,
  streamPanFocus = null,
  onboardingHubPick,
  previewGatewayLayout = true,
  onCameraFrame,
}: OnboardingTreeBackgroundProps) {
  const handleAreaClick = useCallback(
    (area: AreaData) => {
      if (!nonInteractive) onAreaClick?.(area);
    },
    [nonInteractive, onAreaClick],
  );

  const treeInteractive = !nonInteractive || onboardingHubPick != null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: treeInteractive ? "auto" : "none",
        zIndex: 0,
      }}
    >
      <div className="pf-tree-canvas" style={{ width: "100%", height: "100%" }}>
        <style dangerouslySetInnerHTML={{ __html: PF_TREE_CANVAS_CSS }} />
        <div className="pf-tree-canvas-shell">
          <div className="pf-tree-canvas-stage">
            <div style={{ position: "absolute", inset: 0 }}>
              <TreeSVG
                areas={areas}
                previewAreas={previewAreas}
                allAreasForForkGeometry={areas}
                focused={focusedLimbId}
                focusedLimbId={focusedLimbId}
                onToggleLimbFocus={noop}
                panel={{ type: "none" }}
                onClear={noop}
                onAreaClick={handleAreaClick}
                onHubClick={noop}
                onMarkClick={noopMoment}
                onGoalClick={noopGoal}
                dormantLimbIds={dormantLimbIds}
                unlockedLimbIds={unlockedLimbIds}
                activatingLimbId={activatingLimbId ?? null}
                initialFitAreaIds={initialFitAreaIds}
                initialFitPaddingPx={initialFitPaddingPx}
                initialFitIncludePreviewBranchTips={initialFitIncludePreviewBranchTips}
                highlightGoalId={highlightGoalId}
                suppressDevUi
                streamPanFocus={streamPanFocus}
                onboardingHubPickMode={onboardingHubPick}
                previewGatewayLayout={previewGatewayLayout}
                onCameraFrame={onCameraFrame}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
