"use client";

import { useId, type MouseEvent, type PointerEvent } from "react";
import type { TreeIconComponent } from "@/components/icons";
import type { GoalBloomStatus, Point } from "./tree-types";
import type { GoalNodeDerivedRenderState } from "./goal-node-render-phase";
import {
  TREE_GOAL_HEX_VERTEX_RADIUS_PX,
  TREE_GOAL_SURFACE_TITLE_FONT_PX,
  TREE_GOAL_SURFACE_TITLE_GAP_PX,
} from "./tree-view-constants";
import { goalCanvasDisplayLabel, treeMapLimbHueReadableInk } from "./tree-canvas-label";
import { pointyTopHexPathD, TREE_DESIGN_NODE_CORE } from "./tree-design-visual";
import {
  desaturateRgbTowardLuma,
  mixRgb,
  parseHexRgb,
  rgbToHex,
} from "./tree-color-accents";
import { TreeSvgTextLabel } from "./tree-svg-text-label";

/** Core circle radius — sized to sit clearly inside the ~48 px orbital ring. */
const GOAL_CORE_R = 20;
/** Branch glyph icon size inside the core (kept slightly smaller than diameter for breathing room). */
const GOAL_GLYPH_SIZE_PX = 32;
/** Selection halo radius — just outside the core rim. */
const GOAL_SELECTION_R = GOAL_CORE_R + 8;
/** Outer bloom halo radius (only painted when visualPhase === "COMPLETE"). */
const GOAL_OUTER_HALO_R = 70;
/** Dark core fill — matches domain-hub backdrop + Claude Design `PF_T.core`. */
const CORE_FILL_HEX = TREE_DESIGN_NODE_CORE;
/** BLOOMED seal badge — ~16px diameter, sits just inside the core rim (top-right). */
const BLOOM_SEAL_R = 8;

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

type TreeGoalNodeSvgProps = {
  cx: number;
  cy: number;
  color: string;
  status: GoalBloomStatus;
  title: string;
  /** AI tree-canvas label; full {@link title} stays in native tooltip. */
  shortLabel?: string | null;
  /** Goal notes — used to keep salient detail in canvas labels. */
  description?: string | null;
  /** Optional branch-slot icon; falls back to a small filled disc when omitted (domain-cluster goals). */
  branchGlyphIcon?: TreeIconComponent;
  /** Short label under the node; opacity is driven by {@link surfaceTitleOpacity} / LOD (incl. evolution depth). */
  showSurfaceTitle?: boolean;
  /** When set, overrides {@link showSurfaceTitle} with a fade (0 = hidden). */
  surfaceTitleOpacity?: number;
  /** Pointy-top hex rotation (tangent-out from branch). */
  hexRotationRad?: number;
  /** When true, paint pointy-top hex silhouette (Claude Design pursuit grammar). Default on. */
  useHexSilhouette?: boolean;
  /** Milestone-derived visuals — drives core glow + outer halo intensity. */
  milestoneVisual?: GoalNodeDerivedRenderState;
  /** Life-importance surface title scale (distinct from bloom phase). */
  labelAuthorityMul?: number;
  /** Status allows an activity pulse when this goal is selected (BUD only — GROWING uses ambient ring). */
  pulseGrowing: boolean;
  /** Slow ambient ring for in-progress goals (CSS only; GROWING). */
  ambientBreathing?: boolean;
  bloomPlaying: boolean;
  /** Goal detail panel is open for this node — selected halo renders only then. */
  selected: boolean;
  /** Pointer hover — brighter active hex rim + glow (does not affect selected/bloom). */
  hovered?: boolean;
  onClick: (e: MouseEvent | PointerEvent) => void;
  onPointerDown?: (e: PointerEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Right-click / long-press context menu handlers from tree-svg. */
  contextMenuHandlers?: {
    onContextMenu: (e: MouseEvent) => void;
    onPointerDown: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onPointerLeave: (e: PointerEvent) => void;
  };
  didLongPress?: () => boolean;
  /** Stable SVG gradient id seed (SSR-safe); falls back to `useId`. */
  idSeed?: string;
};

function goalSvgIdSeed(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function TreeGoalNodeSvg({
  cx,
  cy,
  color,
  status,
  title,
  shortLabel,
  description,
  branchGlyphIcon: Icon,
  showSurfaceTitle = false,
  surfaceTitleOpacity,
  milestoneVisual,
  labelAuthorityMul = 1,
  hexRotationRad = 0,
  useHexSilhouette = true,
  pulseGrowing,
  ambientBreathing = false,
  bloomPlaying,
  selected,
  hovered = false,
  onClick,
  onPointerDown,
  onMouseEnter,
  onMouseLeave,
  contextMenuHandlers,
  didLongPress,
  idSeed,
}: TreeGoalNodeSvgProps) {
  const groupClass = bloomPlaying ? "tree-goal-bloom-once" : undefined;
  /** Inner opacity pulse only for BUD when selected — GROWING uses outer ambient ring instead. */
  const pulseClass = selected && pulseGrowing && status === "ACTIVE" ? "tree-goal-growing-pulse" : undefined;
  const autoId = useId().replace(/:/g, "");
  const uid = idSeed != null ? goalSvgIdSeed(idSeed) : autoId;
  const glowGradId = `tree-goal-coreglow-${uid}`;
  const haloGradId = `tree-goal-halo-${uid}`;

  const mv = milestoneVisual;
  const glowAlpha = mv?.intensities.coreGlowOpacity01 ?? 0;
  const haloAlpha = mv?.intensities.outerHaloOpacity01 ?? 0;
  const isBloomed = status === "COMPLETE";
  const limbRgb = parseHexRgb(color);
  const limbPaint =
    isBloomed && limbRgb ? rgbToHex(desaturateRgbTowardLuma(limbRgb, 0.44)) : color;
  const bloomedRecedeOpacity = isBloomed ? (selected ? 0.75 : 0.6) : 1;
  const coreRgb = parseHexRgb(CORE_FILL_HEX);
  const limbPaintRgb = parseHexRgb(limbPaint);
  const stampFillHex =
    coreRgb && limbPaintRgb ? rgbToHex(mixRgb(coreRgb, limbPaintRgb, 0.11)) : CORE_FILL_HEX;
  const sealArm = GOAL_CORE_R - 1;
  const sealCx = cx + Math.SQRT1_2 * sealArm;
  const sealCy = cy - Math.SQRT1_2 * sealArm;
  /** Soft accent rim — dimmer when ended, baseline otherwise. */
  const rimStrokeOpacity =
    status === "PAUSED" || status === "ABANDONED" ? 0.62 : status === "ACTIVE" ? (hovered ? 1 : 0.88) : 0.98;
  const activeGlowFillOpacity = hovered ? 0.32 : 0.18;
  const glyphAlphaBase = status === "PAUSED" || status === "ABANDONED" ? 0.72 : status === "COMPLETE" ? 1 : 0.98;
  const glyphAlpha = Math.min(0.97, glyphAlphaBase + (mv?.intensities.coreGlyphOpacityBoost ?? 0));

  /** Two ENDED hatch lines centered in the core — semantic "closed" cue, not bloom geometry. */
  const endedHatch =
    status === "PAUSED" || status === "ABANDONED" ? (
      <>
        <line
          x1={cx - GOAL_CORE_R * 0.42}
          y1={cy - GOAL_CORE_R * 0.42}
          x2={cx + GOAL_CORE_R * 0.42}
          y2={cy + GOAL_CORE_R * 0.42}
          stroke={color}
          strokeWidth={1.2}
          strokeOpacity={0.55}
          pointerEvents="none"
        />
        <line
          x1={cx + GOAL_CORE_R * 0.42}
          y1={cy - GOAL_CORE_R * 0.42}
          x2={cx - GOAL_CORE_R * 0.42}
          y2={cy + GOAL_CORE_R * 0.42}
          stroke={color}
          strokeWidth={1.2}
          strokeOpacity={0.55}
          pointerEvents="none"
        />
      </>
    ) : null;

  const labelY = cy + GOAL_CORE_R + TREE_GOAL_SURFACE_TITLE_GAP_PX;
  const titleOpacity =
    surfaceTitleOpacity != null
      ? surfaceTitleOpacity
      : showSurfaceTitle
        ? selected
          ? 0.9
          : 0.8
        : 0;
  const canvasTitle = goalCanvasDisplayLabel(title, shortLabel, description);
  const surface =
    titleOpacity > 0.04 ? (
      <g pointerEvents="none">
        <title>{title.trim() || "Pursuit"}</title>
        <TreeSvgTextLabel
          x={cx}
          y={labelY}
          text={canvasTitle}
          color={color}
          ink={treeMapLimbHueReadableInk(color)}
          fontSize={TREE_GOAL_SURFACE_TITLE_FONT_PX * labelAuthorityMul}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="hanging"
          opacity={titleOpacity}
          maxLines={2}
          maxWidthPx={TREE_GOAL_SURFACE_TITLE_FONT_PX * labelAuthorityMul * 12}
          letterSpacing="0.04em"
          pill
        />
      </g>
    ) : null;

  const hitR = GOAL_CORE_R + 6;
  const hexR = GOAL_CORE_R;
  const hexPath = pointyTopHexPathD(cx, cy, hexR, hexRotationRad);
  const hexGlowPath = pointyTopHexPathD(cx, cy, hexR * 1.55, hexRotationRad);
  const showHex = useHexSilhouette;
  const completeCheck =
    status === "COMPLETE" ? (
      <path
        d={`M ${cx - 4} ${cy} L ${cx - 1} ${cy + 3} L ${cx + 5} ${cy - 3}`}
        fill="none"
        stroke={limbPaint}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    ) : null;

  return (
    <g
      className={groupClass}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      onClick={(e) => {
        e.stopPropagation();
        if (didLongPress?.()) return;
        onClick(e);
      }}
      onContextMenu={contextMenuHandlers?.onContextMenu}
      onPointerDown={(e) => {
        e.stopPropagation();
        contextMenuHandlers?.onPointerDown(e);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        contextMenuHandlers?.onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        contextMenuHandlers?.onPointerCancel(e);
      }}
      onPointerLeave={(e) => {
        onMouseLeave?.();
        contextMenuHandlers?.onPointerLeave(e);
      }}
      role="button"
      tabIndex={0}
      aria-label={`Pursuit: ${title}`}
    >
      <title>{title}</title>

      {haloAlpha > 0.005 || glowAlpha > 0.005 ? (
        <defs>
          {haloAlpha > 0.005 ? (
            <radialGradient id={haloGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={limbPaint} stopOpacity={0.88} />
              <stop offset="55%" stopColor={limbPaint} stopOpacity={0.38} />
              <stop offset="100%" stopColor={limbPaint} stopOpacity={0} />
            </radialGradient>
          ) : null}
          {glowAlpha > 0.005 ? (
            <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={limbPaint} stopOpacity={1} />
              <stop offset="55%" stopColor={limbPaint} stopOpacity={0.62} />
              <stop offset="100%" stopColor={limbPaint} stopOpacity={0} />
            </radialGradient>
          ) : null}
        </defs>
      ) : null}

      <g style={{ opacity: bloomedRecedeOpacity }}>
        {/* Outer halo: bloomed-only soft outward bleed. */}
        {haloAlpha > 0.005 ? (
          <circle
            cx={cx}
            cy={cy}
            r={GOAL_OUTER_HALO_R}
            fill={`url(#${haloGradId})`}
            fillOpacity={haloAlpha}
            pointerEvents="none"
            aria-hidden
          />
        ) : null}

        {selected ? (
          <circle
            cx={cx}
            cy={cy}
            r={GOAL_SELECTION_R}
            fill="none"
            stroke={limbPaint}
            strokeWidth={1.4}
            strokeOpacity={0.45}
            className="tree-goal-selected-glow"
            pointerEvents="none"
          />
        ) : null}

        {ambientBreathing && !bloomPlaying ? (
          <>
            {/* Soft outer halo — lower amplitude, same slow cycle as inner ember ring. */}
            <circle
              cx={cx}
              cy={cy}
              r={GOAL_CORE_R + 11}
              fill="none"
              stroke={limbPaint}
              strokeWidth={1.45}
              className="tree-goal-ambient-breathe-outer"
              pointerEvents="none"
              aria-hidden
            />
            <circle
              cx={cx}
              cy={cy}
              r={GOAL_CORE_R + 7}
              fill="none"
              stroke={limbPaint}
              strokeWidth={2.25}
              className="tree-goal-ambient-breathe"
              pointerEvents="none"
              aria-hidden
            />
          </>
        ) : null}

        <g className={pulseClass}>
          {showHex ? (
            <>
              {status === "ACTIVE" && !isBloomed ? (
                <path
                  d={hexGlowPath}
                  fill={limbPaint}
                  fillOpacity={activeGlowFillOpacity}
                  className="tree-goal-hover-glow"
                  pointerEvents="none"
                  aria-hidden
                />
              ) : null}
              <path
                d={hexPath}
                fill={CORE_FILL_HEX}
                stroke={limbPaint}
                strokeWidth={selected ? 1.7 : 1.35}
                strokeOpacity={rimStrokeOpacity}
                strokeDasharray={status === "PAUSED" || status === "ABANDONED" ? "2 2" : undefined}
                className="tree-goal-hover-stroke"
                pointerEvents="none"
              />
              {glowAlpha > 0.005 ? (
                <path
                  d={hexPath}
                  fill={`url(#${glowGradId})`}
                  fillOpacity={glowAlpha * 0.85}
                  stroke="none"
                  pointerEvents="none"
                  aria-hidden
                />
              ) : null}
            </>
          ) : (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={GOAL_CORE_R}
                fill={CORE_FILL_HEX}
                fillOpacity={1}
                pointerEvents="none"
              />
              {glowAlpha > 0.005 ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={GOAL_CORE_R * 0.94}
                  fill={`url(#${glowGradId})`}
                  fillOpacity={glowAlpha}
                  pointerEvents="none"
                  aria-hidden
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={GOAL_CORE_R}
                fill="none"
                stroke={limbPaint}
                strokeWidth={1.55}
                strokeOpacity={rimStrokeOpacity}
                pointerEvents="none"
              />
            </>
          )}

          {/* Branch glyph on top of glow + rim / hex. */}
          <g transform={`translate(${cx},${cy})`} pointerEvents="none">
            {Icon ? (
              <Icon size={GOAL_GLYPH_SIZE_PX} color={limbPaint} opacity={glyphAlpha} />
            ) : (
              <circle
                cx={0}
                cy={0}
                r={Math.max(4.5, GOAL_GLYPH_SIZE_PX * 0.22)}
                fill={limbPaint}
                fillOpacity={glyphAlpha * 0.95}
                stroke={CORE_FILL_HEX}
                strokeWidth={1}
                strokeOpacity={0.6}
              />
            )}
          </g>

          {endedHatch}
          {showHex ? completeCheck : null}
        </g>
      </g>

      {isBloomed ? (
        <g pointerEvents="none" aria-hidden>
          <circle
            cx={sealCx}
            cy={sealCy}
            r={BLOOM_SEAL_R}
            fill={stampFillHex}
            fillOpacity={0.94}
            stroke={limbPaint}
            strokeWidth={1}
            strokeOpacity={0.48}
          />
          <circle
            cx={sealCx}
            cy={sealCy}
            r={BLOOM_SEAL_R - 1.3}
            fill="none"
            stroke={limbPaint}
            strokeOpacity={0.24}
            strokeWidth={0.55}
          />
          <text
            x={sealCx}
            y={sealCy}
            textAnchor="middle"
            dominantBaseline="central"
            fill={limbPaint}
            fillOpacity={0.52}
            fontSize={9.75}
            fontWeight={600}
            fontFamily='ui-sans-serif, system-ui, sans-serif, "Segoe UI Symbol"'
          >
            ✓
          </text>
        </g>
      ) : null}

      <circle
        cx={cx}
        cy={cy}
        r={hitR}
        fill="transparent"
        style={{ cursor: "pointer" }}
        pointerEvents="all"
        onMouseEnter={() => onMouseEnter?.()}
        onMouseLeave={() => onMouseLeave?.()}
      />
      {surface}
    </g>
  );
}

/** Legacy export kept for any external sizing consumers (read-only). */
const GOAL_R = GOAL_CORE_R;
export { GOAL_R };
