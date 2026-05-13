"use client";

import type { MouseEvent, PointerEvent, ReactNode } from "react";
import type { TreeIconComponent } from "@/components/icons";
import type { GoalBloomStatus, Point } from "./tree-types";
import type { BloomWholeNodeCoherence } from "./bloom-render-spec";
import type { GoalNodeDerivedRenderState } from "./goal-node-render-phase";
import { FLAGS } from "@/lib/flags";
import { TREE_BRANCH_ICON_SIZE_PX, TREE_GOAL_HEX_VERTEX_RADIUS_PX, TREE_GOAL_SURFACE_TITLE_FONT_PX, TREE_GOAL_SURFACE_TITLE_GAP_PX } from "./tree-view-constants";
import { TreeIconMedallion } from "./tree-icon-medallion";

/** Softer plaque + slight icon scale-down as milestones cohere — glyph sits inside the organism. */
function hexGlyphPlaqueTone(mv: GoalNodeDerivedRenderState | undefined): {
  plaqueOpacity: number;
  iconScaleMul: number;
} {
  if (!mv || mv.visibleOrbitalCount === 0) return { plaqueOpacity: 0.58, iconScaleMul: 1 };
  const t = mv.progress01;
  let plaqueOpacity = 0.54 - t * 0.1;
  let iconScaleMul = 1 - t * 0.02;
  if (mv.visualPhase === "bloomed") {
    plaqueOpacity -= 0.04;
    iconScaleMul -= 0.01;
  } else if (mv.visualPhase === "growing") {
    const gb = mv.progress01;
    plaqueOpacity -= 0.015 * gb;
    iconScaleMul -= 0.004 * gb;
  }
  return {
    plaqueOpacity: Math.max(0.38, Math.min(0.58, plaqueOpacity)),
    iconScaleMul: Math.max(0.96, Math.min(1, iconScaleMul)),
  };
}

function hexMilestoneGlyphOpacityBase(
  mv: GoalNodeDerivedRenderState | undefined,
  status: GoalBloomStatus,
): number {
  if (status === "BUD") return 0.78;
  if (!mv || mv.visibleOrbitalCount === 0) {
    return status === "BLOOMED" ? 0.92 : 0.93;
  }
  const t = mv.progress01;
  if (mv.visualPhase === "bloomed" || status === "BLOOMED") return 0.856 + t * 0.028;
  if (mv.visualPhase === "growing") {
    const early = 0.894 + t * 0.014;
    const late = 0.876 + t * 0.021;
    return early + (late - early) * t;
  }
  return 0.894 + t * 0.014;
}

const GOAL_R = 11;

const HEX_BUD_ICON_PX = 40;

/**
 * Branch-slot glyph centered on (cx, cy), or a **simple filled circle** when `Icon` is omitted
 * (domain-cluster goals carry no branch glyph — hub owns the taxonomy icon).
 */
function GoalBranchGlyph({
  Icon,
  cx,
  cy,
  size,
  color,
  opacity = 1,
  className,
  withPlaque = false,
  plaqueOpacity = 0.42,
  iconScaleMul = 1,
}: {
  Icon: TreeIconComponent | undefined;
  cx: number;
  cy: number;
  size: number;
  color: string;
  opacity?: number;
  className?: string;
  /** Soft dark disk behind strokes so limb-colored lines don’t compete with the glyph. */
  withPlaque?: boolean;
  plaqueOpacity?: number;
  /** Micro scale for milestone-organism embedding (hex bloom); keeps icons recognizable. */
  iconScaleMul?: number;
}) {
  const drawSize = size * iconScaleMul;
  if (!Icon) {
    const r = Math.max(6.2, drawSize * 0.28);
    if (!withPlaque) {
      return (
        <g transform={`translate(${cx},${cy})`} pointerEvents="none" className={className}>
          <circle
            cx={0}
            cy={0}
            r={r}
            fill={color}
            fillOpacity={opacity * 0.95}
            stroke="#0C0A09"
            strokeWidth={1}
            strokeOpacity={0.6}
          />
        </g>
      );
    }
    return (
      <g transform={`translate(${cx},${cy})`} pointerEvents="none" className={className}>
        <TreeIconMedallion cx={0} cy={0} color={color} artworkSpanPx={drawSize} tier="goal">
          <circle
            cx={0}
            cy={0}
            r={r}
            fill={color}
            fillOpacity={opacity * 0.95}
            stroke="#0C0A09"
            strokeWidth={1}
            strokeOpacity={0.6}
          />
        </TreeIconMedallion>
      </g>
    );
  }
  if (!withPlaque) {
    return (
      <g transform={`translate(${cx},${cy})`} pointerEvents="none" className={className}>
        <Icon size={drawSize} color={color} opacity={opacity} />
      </g>
    );
  }
  return (
    <g transform={`translate(${cx},${cy})`} pointerEvents="none" className={className}>
      <TreeIconMedallion cx={0} cy={0} color={color} artworkSpanPx={drawSize} tier="goal">
        <Icon size={drawSize} color={color} opacity={opacity} />
      </TreeIconMedallion>
    </g>
  );
}

/** Pointy-top hex vertices starting at top, circumradius `r`; `rotationRad` spins the shape about the center. */
export function pointyTopHexVertices(cx: number, cy: number, r: number, rotationRad = 0): Point[] {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const th = -Math.PI / 2 + (i * Math.PI) / 3 + rotationRad;
    return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
  });
}

/** Vertex opposite the catalog “incoming” tip — attach point for synthetic child spokes. */
export function goalHexBottomAttach(
  cx: number,
  cy: number,
  r = TREE_GOAL_HEX_VERTEX_RADIUS_PX,
  rotationRad = 0,
): Point {
  return pointyTopHexVertices(cx, cy, r, rotationRad)[3]!;
}

function truncateGoalTitle(raw: string, maxLen: number): string {
  const t = raw.trim() || "Goal";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

function starPath(cx: number, cy: number, spikes: number, outer: number, inner: number): string {
  let d = "";
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i++) {
    const x = cx + Math.cos(rot) * outer;
    const y = cy + Math.sin(rot) * outer;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    rot += step;
    const ix = cx + Math.cos(rot) * inner;
    const iy = cy + Math.sin(rot) * inner;
    d += `L${ix.toFixed(3)},${iy.toFixed(3)}`;
    rot += step;
  }
  return `${d}Z`;
}

/** Reusable bloom / starburst shape for goals (and similar UI). */
export function GoalBloomShape({
  cx,
  cy,
  color,
  outer = 8,
  inner = 3.5,
}: {
  cx: number;
  cy: number;
  color: string;
  outer?: number;
  inner?: number;
}) {
  return (
    <path d={starPath(cx, cy, 6, outer, inner)} fill={color} stroke={color} strokeWidth={0.35} pointerEvents="none" />
  );
}

type TreeGoalNodeSvgProps = {
  cx: number;
  cy: number;
  color: string;
  status: GoalBloomStatus;
  title: string;
  /**
   * Optional branch-slot icon. When omitted, `GoalBranchGlyph` draws a small limb-colored
   * circle so goals stay readable on the orbit ring.
   */
  branchGlyphIcon?: TreeIconComponent;
  /** Short label under the node (root goals on a branch line); deeper nodes rely on native tooltip. */
  showSurfaceTitle?: boolean;
  /** Matches catalog tangent alignment for orbital milestone vertices (`FLAGS.GOAL_MILESTONES`). */
  hexRotationRad?: number;
  /**
   * Milestone-derived visuals when hex orbitals are enabled — opacity/glow tuning only;
   * does not replace {@link status}.
   */
  milestoneVisual?: GoalNodeDerivedRenderState;
  /** Milestone bloom geometry: hex organism ring + extra core lift (from {@link deriveBloomRenderSpec}). */
  bloomWholeNode?: BloomWholeNodeCoherence;
  /**
   * When set (GOAL_MILESTONES), closed polygon for the organism scaffold — adaptive N-gon vertex count.
   * Falls back to a regular hex when omitted.
   */
  organismRingVerts?: readonly Point[] | null;
  /** Life-importance surface title scale (distinct from bloom phase). */
  labelAuthorityMul?: number;
  /** Status allows an activity pulse when this goal is selected (see {@link selected}). */
  pulseGrowing: boolean;
  bloomPlaying: boolean;
  /** Goal detail panel is open for this node — halos / pulses render only then. */
  selected: boolean;
  onClick: (e: MouseEvent | PointerEvent) => void;
};

export function TreeGoalNodeSvg({
  cx,
  cy,
  color,
  status,
  title,
  branchGlyphIcon,
  showSurfaceTitle = false,
  hexRotationRad = 0,
  milestoneVisual,
  bloomWholeNode,
  organismRingVerts = null,
  labelAuthorityMul = 1,
  pulseGrowing,
  bloomPlaying,
  selected,
  onClick,
}: TreeGoalNodeSvgProps) {
  const groupClass = bloomPlaying ? "tree-goal-bloom-once" : undefined;
  const pulseClass = selected && pulseGrowing ? "tree-goal-growing-pulse" : undefined;
  const hexR = TREE_GOAL_HEX_VERTEX_RADIUS_PX;
  const useHex = FLAGS.GOAL_MILESTONES;
  const G = branchGlyphIcon;
  const mv = useHex ? milestoneVisual : undefined;
  /** Hex milestones: avoid a second bold circular frame competing with bloom geometry. */
  const softSelectedHalo = Boolean(useHex && mv);
  const hexGlyphTone = useHex ? hexGlyphPlaqueTone(mv) : { plaqueOpacity: 0.42, iconScaleMul: 1 };
  const coreGlyphOpacity = (base: number) =>
    mv
      ? Math.min(
          0.97,
          base +
            mv.intensities.coreGlyphOpacityBoost +
            (bloomWholeNode?.coreOpacityAdd ?? 0),
        )
      : base;

  let body: ReactNode;
  if (useHex) {
    const glowR = hexR + 10;
    if (status === "ENDED") {
      body = (
        <>
          {selected ? (
            <circle
              cx={cx}
              cy={cy}
              r={glowR}
              fill="none"
              stroke={color}
              strokeWidth={softSelectedHalo ? 1 : 1.5}
              strokeOpacity={softSelectedHalo ? 0.24 : 0.42}
              strokeDasharray={softSelectedHalo ? "5 11" : undefined}
              className="tree-goal-selected-glow"
              pointerEvents="none"
            />
          ) : null}
          <GoalBranchGlyph
            Icon={G}
            cx={cx}
            cy={cy}
            size={TREE_BRANCH_ICON_SIZE_PX}
            color={color}
            opacity={coreGlyphOpacity(0.58)}
            plaqueOpacity={hexGlyphTone.plaqueOpacity * 0.94}
            iconScaleMul={hexGlyphTone.iconScaleMul}
          />
          <line
            x1={cx - hexR * 0.45}
            y1={cy - hexR * 0.45}
            x2={cx + hexR * 0.45}
            y2={cy + hexR * 0.45}
            stroke={color}
            strokeWidth={1.35}
            opacity={0.55}
            pointerEvents="none"
          />
          <line
            x1={cx + hexR * 0.45}
            y1={cy - hexR * 0.45}
            x2={cx - hexR * 0.45}
            y2={cy + hexR * 0.45}
            stroke={color}
            strokeWidth={1.35}
            opacity={0.55}
            pointerEvents="none"
          />
        </>
      );
    } else if (status === "BLOOMED") {
      body = (
        <>
          {selected ? (
            <circle
              cx={cx}
              cy={cy}
              r={glowR}
              fill="none"
              stroke={color}
              strokeWidth={softSelectedHalo ? 1.05 : 1.65}
              strokeOpacity={softSelectedHalo ? 0.26 : 0.48}
              strokeDasharray={softSelectedHalo ? "5 12" : undefined}
              className="tree-goal-selected-glow"
              pointerEvents="none"
            />
          ) : null}
          <GoalBranchGlyph
            Icon={G}
            cx={cx}
            cy={cy}
            size={TREE_BRANCH_ICON_SIZE_PX}
            color={color}
            opacity={coreGlyphOpacity(hexMilestoneGlyphOpacityBase(mv, status))}
            plaqueOpacity={hexGlyphTone.plaqueOpacity}
            iconScaleMul={hexGlyphTone.iconScaleMul}
          />
        </>
      );
    } else if (status === "BUD") {
      body = (
        <GoalBranchGlyph
          Icon={G}
          cx={cx}
          cy={cy}
          size={HEX_BUD_ICON_PX}
          color={color}
          opacity={coreGlyphOpacity(hexMilestoneGlyphOpacityBase(mv, status))}
          className={pulseClass}
          plaqueOpacity={hexGlyphTone.plaqueOpacity}
          iconScaleMul={hexGlyphTone.iconScaleMul}
        />
      );
    } else {
      body = (
        <>
          {selected ? (
            <circle
              cx={cx}
              cy={cy}
              r={glowR}
              fill="none"
              stroke={color}
              strokeWidth={softSelectedHalo ? 1.08 : 1.75}
              strokeOpacity={softSelectedHalo ? 0.28 : 0.5}
              strokeDasharray={softSelectedHalo ? "5 12" : undefined}
              className="tree-goal-selected-glow"
              pointerEvents="none"
            />
          ) : null}
          <GoalBranchGlyph
            Icon={G}
            cx={cx}
            cy={cy}
            size={TREE_BRANCH_ICON_SIZE_PX}
            color={color}
            opacity={coreGlyphOpacity(hexMilestoneGlyphOpacityBase(mv, status))}
            className={pulseClass}
            plaqueOpacity={hexGlyphTone.plaqueOpacity}
            iconScaleMul={hexGlyphTone.iconScaleMul}
          />
        </>
      );
    }
  } else if (status === "ENDED") {
    body = (
      <>
        {selected ? (
          <circle
            cx={cx}
            cy={cy}
            r={GOAL_R + 7}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.42}
            className="tree-goal-selected-glow"
            pointerEvents="none"
          />
        ) : null}
        <GoalBranchGlyph
          Icon={G}
          cx={cx}
          cy={cy}
          size={TREE_BRANCH_ICON_SIZE_PX}
          color={color}
          opacity={0.56}
        />
        <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke={color} strokeWidth={1.2} opacity={0.55} pointerEvents="none" />
        <line x1={cx - 5} y1={cy + 5} x2={cx + 5} y2={cy - 5} stroke={color} strokeWidth={1.2} opacity={0.55} pointerEvents="none" />
      </>
    );
  } else if (status === "BLOOMED") {
    body = (
      <>
        {selected ? (
          <circle
            cx={cx}
            cy={cy}
            r={13}
            fill="none"
            stroke={color}
            strokeWidth={1.65}
            strokeOpacity={0.48}
            className="tree-goal-selected-glow"
            pointerEvents="none"
          />
        ) : null}
        <GoalBloomShape cx={cx} cy={cy} color={color} />
        <GoalBranchGlyph
          Icon={G}
          cx={cx}
          cy={cy}
          size={TREE_BRANCH_ICON_SIZE_PX}
          color={color}
          opacity={0.9}
        />
      </>
    );
  } else if (status === "BUD") {
    body = (
      <>
        {selected ? (
          <g className="tree-goal-bud-halo" style={{ transformOrigin: `${cx}px ${cy}px` }} pointerEvents="none">
            <circle cx={cx} cy={cy} r={GOAL_R + 6} fill={color} opacity={0.06} />
            <circle cx={cx} cy={cy} r={GOAL_R + 3} fill={color} opacity={0.1} />
          </g>
        ) : null}
        <circle
          cx={cx}
          cy={cy}
          r={GOAL_R}
          fill="none"
          stroke={color}
          strokeWidth={2.35}
          strokeOpacity={selected ? 0.82 : 0.62}
          className={pulseClass}
          pointerEvents="none"
        />
        <GoalBranchGlyph
          Icon={G}
          cx={cx}
          cy={cy}
          size={TREE_BRANCH_ICON_SIZE_PX}
          color={color}
          opacity={0.9}
          withPlaque={false}
        />
      </>
    );
  } else {
    body = (
      <>
        {selected ? (
          <circle
            cx={cx}
            cy={cy}
            r={GOAL_R + 7}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeOpacity={0.5}
            className="tree-goal-selected-glow"
            pointerEvents="none"
          />
        ) : null}
        <GoalBranchGlyph
          Icon={G}
          cx={cx}
          cy={cy}
          size={TREE_BRANCH_ICON_SIZE_PX}
          color={color}
          opacity={status === "BRANCHED" ? 0.96 : 0.9}
          className={pulseClass}
        />
      </>
    );
  }

  const ringVertsForLabel =
    organismRingVerts && organismRingVerts.length >= 2
      ? organismRingVerts
      : pointyTopHexVertices(cx, cy, hexR, hexRotationRad);
  const hexBottomY = useHex ? Math.max(...ringVertsForLabel.map((v) => v.y)) : cy;
  const labelY = useHex ? hexBottomY + TREE_GOAL_SURFACE_TITLE_GAP_PX : cy + TREE_GOAL_SURFACE_TITLE_GAP_PX;
  const labelFillOpacity = selected ? 0.82 : 0.77;
  const labelStrokeOpacity = selected ? 0.36 : 0.28;
  const surface = showSurfaceTitle ? (
    <text
      x={cx}
      y={labelY}
      textAnchor="middle"
      dominantBaseline="hanging"
      fontSize={TREE_GOAL_SURFACE_TITLE_FONT_PX * labelAuthorityMul}
      fontWeight={600}
      fill={color}
      fillOpacity={labelFillOpacity + 0.08}
      stroke="#0C0A09"
      strokeOpacity={labelStrokeOpacity + 0.12}
      strokeWidth={0.75}
      paintOrder="stroke fill"
      pointerEvents="none"
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        letterSpacing: "0.04em",
      }}
    >
      {truncateGoalTitle(title, 30)}
    </text>
  ) : null;

  const hitR = useHex ? hexR + 5 : GOAL_R + 7;

  return (
    <g
      className={groupClass}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
      aria-label={`Goal: ${title}`}
    >
      <title>{title}</title>
      {useHex &&
      bloomWholeNode &&
      bloomWholeNode.hexRingOpacity > 0.008 &&
      status !== "ENDED" ? (
        <polygon
          points={(organismRingVerts && organismRingVerts.length >= 2
            ? organismRingVerts
            : pointyTopHexVertices(cx, cy, hexR, hexRotationRad)
          )
            .map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)}`)
            .join(" ")}
          fill="none"
          stroke={color}
          strokeOpacity={bloomWholeNode.hexRingOpacity}
          strokeWidth={bloomWholeNode.hexRingWidthPx}
          strokeDasharray={
            bloomWholeNode.hexRingDasharray.length > 0 ? bloomWholeNode.hexRingDasharray : undefined
          }
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          aria-hidden
        />
      ) : null}
      {body}
      <circle cx={cx} cy={cy} r={hitR} fill="transparent" style={{ cursor: "pointer" }} pointerEvents="all" />
      {surface}
    </g>
  );
}

export { GOAL_R };
