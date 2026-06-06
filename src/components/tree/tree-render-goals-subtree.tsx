"use client";

import type { MouseEvent, PointerEvent } from "react";
import { FLAGS } from "@/lib/flags";
import { deriveGoalNodeRenderState } from "./goal-node-render-phase";
import {
  authorityRenderFactors,
  countGoalSubtreeNodes,
  deriveGoalVisualAuthoritySpec,
} from "./goal-visual-authority";
import { goalSurfaceTitleOpacity, type LimbLabelContext } from "./tree-label-lod";
import { goalHexBottomAttach, TreeGoalNodeSvg } from "./tree-goal-visual";
import {
  adaptiveOrbitalVertices,
  goalAdaptiveOrbitalAttach,
  orbitalLayoutRadiusMul,
} from "./tree-orbital-layout";
import { continuationChildScreenPosition } from "./tree-branch-geometry";
import {
  flattenGoalsById,
  goalPursuitDepth,
  milestoneConnectorStrokeProps,
  pursuitConnectorStrokeWidth,
} from "./tree-connector-strokes";
import type { AreaData, TreeGoalNode } from "./tree-types";
import { TreeElementGuideTag } from "./tree-element-guide-tag";
import { roadmapGoalShowsProgressPulse } from "./tree-view-badges";
import type { PanelState, NodeContextMenuTargetBase } from "./tree-view-types";
import type { TreeRenderQualityFactors } from "./tree-render-quality";
import {
  snapTreeSvgScalar,
  TREE_GOAL_HEX_VERTEX_RADIUS_PX,
  TREE_GOAL_MAX_CHILDREN_PER_NODE,
  TREE_GOAL_PROGRESS_RING_RADIUS_PX,
  TREE_GOAL_RENDER_MAX_DEPTH,
} from "./tree-view-constants";

/** Below this zoom the dots fade out so only the core + glow remain readable. */
const ORBITAL_DOT_VISIBILITY_MIN_ZOOM = 0.9;
/** Orbital dot radius — matches prior orbital milestone visuals (labels removed from canvas). */
const ORBITAL_DOT_R = 7;

/** Curved child spoke — cubic ease so joins read botanical, not kinky poly-lines. */
function childGoalSpokePathD(
  attachX: number,
  attachY: number,
  parentCx: number,
  parentCy: number,
  childX: number,
  childY: number,
): string {
  const ax = snapTreeSvgScalar(attachX);
  const ay = snapTreeSvgScalar(attachY);
  const cx = snapTreeSvgScalar(childX);
  const cy = snapTreeSvgScalar(childY);
  const dx = cx - ax;
  const dy = cy - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const c1x = ax + ux * dist * 0.36 + (parentCx - ax) * 0.15;
  const c1y = ay + uy * dist * 0.36 + (parentCy - ay) * 0.15;
  const c2x = cx - ux * dist * 0.3 + (parentCx - cx) * 0.09;
  const c2y = cy - uy * dist * 0.3 + (parentCy - cy) * 0.09;
  return `M ${ax} ${ay} C ${snapTreeSvgScalar(c1x)},${snapTreeSvgScalar(c1y)} ${snapTreeSvgScalar(c2x)},${snapTreeSvgScalar(c2y)} ${cx} ${cy}`;
}

export function renderGoalsSubtree(
  goal: TreeGoalNode,
  pos: { x: number; y: number },
  area: AreaData,
  areaColor: string,
  panel: PanelState,
  bloomPlayingIds: Set<string>,
  onGoalClick: (g: TreeGoalNode, a: AreaData) => void,
  shouldSuppressClick: () => boolean,
  depth: number,
  branchThreadIndex: number,
  showElementGuide: boolean,
  hexRotationRad = 0,
  /** Viewport scale / baseline — biases orbital dot visibility at far zoom. */
  zoomRatio = 2.65,
  // Render-quality factors retained for signature compatibility with callers (currently unused
  // by the orbital-dot anatomy; preserved so future motion / Canvas tier can re-wire).
  _renderQuality?: TreeRenderQualityFactors,
  domainHubPt: { x: number; y: number } | null = null,
  limbLabelCtx: LimbLabelContext = {
    zoomRatio,
    limbFocused: false,
    limbDeemphasized: false,
  },
  goalsById?: Map<string, TreeGoalNode>,
  editMapMode = false,
  onEditGoalPointerDown?: (
    goal: TreeGoalNode,
    area: AreaData,
    e: PointerEvent,
    originX: number,
    originY: number,
  ) => void,
  editDraggedGoalId: string | null = null,
  hoveredGoalId: string | null = null,
  onHoveredGoalChange?: (goalId: string | null) => void,
  contextMenuTargetId: string | null = null,
  bindNodeContextMenu?: (
    target: NodeContextMenuTargetBase,
  ) => {
    onContextMenu: (e: MouseEvent) => void;
    onPointerDown: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onPointerLeave: (e: PointerEvent) => void;
  },
  didLongPress?: () => boolean,
) {
  void _renderQuality;
  void branchThreadIndex;
  const goalLookup = goalsById ?? flattenGoalsById([goal]);
  const milestoneStroke = milestoneConnectorStrokeProps();
  const x = snapTreeSvgScalar(pos.x);
  const y = snapTreeSvgScalar(pos.y);
  const goalSelected = panel.type === "goal" && panel.goal.id === goal.id;
  const hideForEditDrag = editDraggedGoalId != null && goal.id === editDraggedGoalId;
  const orbitals = goal.orbitalMilestones ?? [];
  const showOrbitalDots = FLAGS.GOAL_MILESTONES && orbitals.length > 0;
  const milestoneVisual = deriveGoalNodeRenderState({
    bloomStatus: goal.bloomStatus,
    orbitalMilestones: orbitals,
  });
  const visualAuthority = deriveGoalVisualAuthoritySpec({
    goal,
    depth,
    subtreeSize: countGoalSubtreeNodes(goal),
    areaId: area.id,
  });
  const authorityFactors = authorityRenderFactors(visualAuthority.authorityMul);
  const visibleOrbitalCountForLayout =
    milestoneVisual.visibleOrbitalCount;
  const trunkOverviewOrbitalMul =
    FLAGS.TREE_TRUNK_LAYOUT && !goalSelected && zoomRatio < 1.35 ? 0.78 : 1;
  const orbitalR =
    TREE_GOAL_HEX_VERTEX_RADIUS_PX *
    orbitalLayoutRadiusMul(visibleOrbitalCountForLayout) *
    authorityFactors.orbitalSpreadMul *
    trunkOverviewOrbitalMul;
  const orbitalLayoutVerts =
    showOrbitalDots && visibleOrbitalCountForLayout > 0
      ? adaptiveOrbitalVertices(x, y, orbitalR, visibleOrbitalCountForLayout, hexRotationRad)
      : null;

  const branchAttachWorld =
    FLAGS.GOAL_MILESTONES && showOrbitalDots && orbitalLayoutVerts
      ? goalAdaptiveOrbitalAttach(x, y, orbitalR, visibleOrbitalCountForLayout, hexRotationRad)
      : null;

  const branchOut =
    branchAttachWorld ??
    (FLAGS.GOAL_MILESTONES
      ? goalHexBottomAttach(x, y, TREE_GOAL_HEX_VERTEX_RADIUS_PX, hexRotationRad)
      : { x, y });

  const dotsVisible = zoomRatio >= ORBITAL_DOT_VISIBILITY_MIN_ZOOM;
  const maxMilestonePosition =
    goal.milestones.length > 0 ? Math.max(...goal.milestones.map((mm) => mm.position)) : 0;
  const hasMilestones = milestoneVisual.visibleOrbitalCount > 0;
  const progress01 = milestoneVisual.progress01;
  const milestoneProgressDecor =
    !hasMilestones || milestoneVisual.visualPhase === "COMPLETE" || milestoneVisual.visualPhase === "ON_HOLD" ? null : (
      <circle
        cx={x}
        cy={y}
        r={TREE_GOAL_PROGRESS_RING_RADIUS_PX}
        fill="none"
        stroke={areaColor}
        strokeWidth={progress01 > 0 ? 2 : 1.4}
        strokeOpacity={progress01 === 0 ? 0.24 : progress01 < 0.5 ? 0.4 : 0.6}
        strokeDasharray={
          progress01 === 0
            ? "2 4"
            : `${progress01} ${1 - progress01}`
        }
        pathLength={progress01 > 0 ? 1 : undefined}
        strokeLinecap={progress01 > 0 ? "round" : undefined}
        transform={progress01 > 0 ? `rotate(-90 ${x} ${y})` : undefined}
        pointerEvents="none"
        aria-hidden
      />
    );

  const orbitalConnectors =
    showOrbitalDots && orbitalLayoutVerts && dotsVisible
      ? orbitals.map((m, i) => {
          const v = orbitalLayoutVerts[i];
          if (!v) return null;
          const dotX = snapTreeSvgScalar(v.x);
          const dotY = snapTreeSvgScalar(v.y);
          return (
            <line
              key={`orbital-conn-${m.id}`}
              data-tree-orbital-connector="1"
              x1={x}
              y1={y}
              x2={dotX}
              y2={dotY}
              stroke={areaColor}
              strokeWidth={milestoneStroke.strokeWidth}
              strokeDasharray={milestoneStroke.strokeDasharray}
              strokeOpacity={0.4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              aria-hidden
            />
          );
        })
      : null;

  /** Milestone copy lives in the goal panel; canvas shows progress dots only (+ native tooltip). */
  const orbitalDots =
    showOrbitalDots && orbitalLayoutVerts && dotsVisible
      ? orbitals.map((m, i) => {
          const v = orbitalLayoutVerts[i];
          if (!v) return null;
          const dotX = snapTreeSvgScalar(v.x);
          const dotY = snapTreeSvgScalar(v.y);
          const major = m.position === 0 || m.position === maxMilestonePosition;
          const dotR = ORBITAL_DOT_R * (major ? 1.15 : 1);
          return (
            <g key={m.id} pointerEvents="none">
              <title>{m.title}</title>
              {m.completed ? (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r={dotR + 7}
                  fill={areaColor}
                  fillOpacity={0.42}
                />
              ) : (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r={dotR + 4}
                  fill={areaColor}
                  fillOpacity={0.1}
                />
              )}
              {m.completed ? (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r={dotR}
                  fill={areaColor}
                  fillOpacity={1}
                  stroke={areaColor}
                  strokeOpacity={1}
                  strokeWidth={0.85}
                />
              ) : (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r={dotR}
                  fill="none"
                  stroke={areaColor}
                  strokeOpacity={0.82}
                  strokeWidth={1.45}
                />
              )}
            </g>
          );
        })
      : null;

  const visibleChildren =
    depth < TREE_GOAL_RENDER_MAX_DEPTH
      ? goal.childGoals.slice(0, TREE_GOAL_MAX_CHILDREN_PER_NODE)
      : [];

  const childSpokeOpacity = 0.62;

  const childNodes = visibleChildren.map((c, ci) => {
    const childSpokeWidth = pursuitConnectorStrokeWidth(goalPursuitDepth(c.id, goalLookup));
    const n = visibleChildren.length;
    let h = 2166136261;
    for (let k = 0; k < c.id.length; k += 1) {
      h ^= c.id.charCodeAt(k)!;
      h = Math.imul(h, 16777619);
    }
    const lenJitter = (((h >>> 9) % 11) - 5) * 0.95;
    let cpos: { x: number; y: number };
    // Continuation children (`parentGoalId`) — hub-ray layout, not branch-line sequence.
    if (domainHubPt && c.parentGoalId) {
      const raw = continuationChildScreenPosition({ x, y }, domainHubPt, ci, c.id, depth);
      cpos = {
        x: snapTreeSvgScalar(raw.x),
        y: snapTreeSvgScalar(raw.y),
      };
    } else {
      const angJitter = (((h >>> 0) % 19) - 9) * 0.034;
      const ang = (ci / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2 + angJitter + depth * 0.09;
      const len = 54 + depth * 12 + lenJitter;
      cpos = {
        x: snapTreeSvgScalar(x + Math.cos(ang) * len),
        y: snapTreeSvgScalar(y + Math.sin(ang) * len),
      };
    }
    return (
      <g key={c.id}>
        {domainHubPt && c.parentGoalId ? null : (
          <path
            d={childGoalSpokePathD(branchOut.x, branchOut.y, x, y, cpos.x, cpos.y)}
            fill="none"
            stroke={areaColor}
            strokeWidth={childSpokeWidth}
            opacity={childSpokeOpacity}
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        {renderGoalsSubtree(
          c,
          cpos,
          area,
          areaColor,
          panel,
          bloomPlayingIds,
          onGoalClick,
          shouldSuppressClick,
          depth + 1,
          branchThreadIndex,
          showElementGuide,
          0,
          zoomRatio,
          _renderQuality,
          domainHubPt,
          limbLabelCtx,
          goalLookup,
          editMapMode,
          onEditGoalPointerDown,
          editDraggedGoalId,
          hoveredGoalId,
          onHoveredGoalChange,
          contextMenuTargetId,
          bindNodeContextMenu,
          didLongPress,
        )}
      </g>
    );
  });

  return (
    <g style={editMapMode ? { cursor: "grab" } : undefined}>
      <g opacity={hideForEditDrag ? 0 : 1} pointerEvents={hideForEditDrag ? "none" : undefined}>
      <TreeGoalNodeSvg
        cx={x}
        cy={y}
        color={areaColor}
        status={goal.bloomStatus}
        title={goal.title}
        shortLabel={goal.shortLabel}
        description={goal.description}
        surfaceTitleOpacity={goalSurfaceTitleOpacity({
          ...limbLabelCtx,
          depth,
          goalSelected,
        })}
        hexRotationRad={hexRotationRad}
        milestoneVisual={milestoneVisual}
        labelAuthorityMul={authorityFactors.labelFontSizeMul}
        pulseGrowing={roadmapGoalShowsProgressPulse(goal.bloomStatus)}
        ambientBreathing={goal.bloomStatus === "ACTIVE"}
        bloomPlaying={bloomPlayingIds.has(goal.id)}
        selected={goalSelected}
        hovered={hoveredGoalId === goal.id || contextMenuTargetId === goal.id}
        idSeed={goal.id}
        onMouseEnter={() => onHoveredGoalChange?.(goal.id)}
        onMouseLeave={() => {
          if (hoveredGoalId === goal.id) onHoveredGoalChange?.(null);
        }}
        contextMenuHandlers={
          bindNodeContextMenu
            ? bindNodeContextMenu({ kind: "pursuit", area, goal })
            : undefined
        }
        didLongPress={didLongPress}
        onClick={() => {
          if (editMapMode) return;
          if (didLongPress?.()) return;
          if (shouldSuppressClick()) return;
          onGoalClick(goal, area);
        }}
        onPointerDown={
          editMapMode && onEditGoalPointerDown && !hideForEditDrag
            ? (e) => {
                if (e.button !== 0) return;
                onEditGoalPointerDown(goal, area, e, x, y);
              }
            : undefined
        }
      />
      {milestoneProgressDecor}
      {showElementGuide ? <TreeElementGuideTag x={x} y={y - 14} text="roadmap-goal" /> : null}
      {orbitalConnectors}
      {orbitalDots}
      </g>
      {childNodes}
    </g>
  );
}
