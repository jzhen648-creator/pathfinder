"use client";

import { TreeIconMedallion, iconMedallionRadii } from "@/components/tree/tree-icon-medallion";

/** Dark core — `tree-goal-visual` / domain-hub disc. */
export const TREE_CORE_FILL = "#0d0d0f";

/** Domain hub glyph span that yields ~18px disc (column schematic layout `HUB_R`). */
export const PREVIEW_HUB_ARTWORK_SPAN_PX = 8;
/** Hub medallion in real tree-fragment preview (~72px main-tree glyph at 0.5 scale). */
export const STREAM_HUB_PREVIEW_ARTWORK_SPAN_PX = 36;

/** Limb accent — set on `.stream-preview-diagram` via `--stream-accent`. */
export const STREAM_PREVIEW_ACCENT = "var(--stream-accent, currentColor)";

/** Scaled copies of `tree-svg` medallion / gateway filters for miniature preview. */
export function StreamPreviewTreeDefs({ prefix }: { prefix: string }) {
  const auraId = `${prefix}-hub-aura`;
  const haloId = `${prefix}-med-halo`;
  return (
    <defs>
      <filter
        id={auraId}
        x="-150%"
        y="-150%"
        width="400%"
        height="400%"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="gwAuraOuter" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="gwAuraMid" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="gwAuraNear" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="gwAuraTight" />
        <feComponentTransfer in="gwAuraOuter" result="gwAuraOuterDim">
          <feFuncA type="linear" slope="0.38" intercept="0" />
        </feComponentTransfer>
        <feComponentTransfer in="gwAuraMid" result="gwAuraMidDim">
          <feFuncA type="linear" slope="0.55" intercept="0" />
        </feComponentTransfer>
        <feComponentTransfer in="gwAuraNear" result="gwAuraNearDim">
          <feFuncA type="linear" slope="0.72" intercept="0" />
        </feComponentTransfer>
        <feComponentTransfer in="gwAuraTight" result="gwAuraTightDim">
          <feFuncA type="linear" slope="0.88" intercept="0" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="gwAuraOuterDim" />
          <feMergeNode in="gwAuraMidDim" />
          <feMergeNode in="gwAuraNearDim" />
          <feMergeNode in="gwAuraTightDim" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter
        id={haloId}
        x="-180%"
        y="-180%"
        width="460%"
        height="460%"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="haloFar" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="haloMid" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="haloNear" />
        <feComponentTransfer in="haloFar" result="haloFarDim">
          <feFuncA type="linear" slope="0.42" intercept="0" />
        </feComponentTransfer>
        <feComponentTransfer in="haloMid" result="haloMidDim">
          <feFuncA type="linear" slope="0.58" intercept="0" />
        </feComponentTransfer>
        <feComponentTransfer in="haloNear" result="haloNearDim">
          <feFuncA type="linear" slope="0.75" intercept="0" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="haloFarDim" />
          <feMergeNode in="haloMidDim" />
          <feMergeNode in="haloNearDim" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** Fixed prefix — avoids `useId` hydration mismatches in SSR preview SVG. */
export const STREAM_HUB_PREVIEW_SVG_PREFIX = "stream-hub-preview";

export function getStreamHubPreviewFilterIds() {
  const p = STREAM_HUB_PREVIEW_SVG_PREFIX;
  return {
    prefix: p,
    hubAuraId: `${p}-hub-aura`,
    medHaloId: `${p}-med-halo`,
  };
}

/** Domain hub medallion — same layers as `TreeIconMedallion` tier `domainHub`. */
export function PreviewHubMedallion({
  cx,
  cy,
  hubAuraId,
  medHaloId,
  color = STREAM_PREVIEW_ACCENT,
  artworkSpanPx = PREVIEW_HUB_ARTWORK_SPAN_PX,
  idSeed = `${STREAM_HUB_PREVIEW_SVG_PREFIX}-hub`,
}: {
  cx: number;
  cy: number;
  hubAuraId: string;
  medHaloId: string;
  color?: string;
  artworkSpanPx?: number;
  idSeed?: string;
}) {
  const innerR = Math.max(2.5, artworkSpanPx * 0.22);
  const { discR, bloomR } = iconMedallionRadii(artworkSpanPx, "domainHub");
  return (
    <g data-stream-preview-hub="1">
      {/* Opaque base so the hub stays visible even if SVG filters fail to resolve */}
      <circle cx={cx} cy={cy} r={discR * 1.04} fill={TREE_CORE_FILL} />
      <circle
        cx={cx}
        cy={cy}
        r={bloomR}
        fill={color}
        fillOpacity={0.12}
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      <TreeIconMedallion
        cx={cx}
        cy={cy}
        color={color}
        artworkSpanPx={artworkSpanPx}
        tier="domainHub"
        auraFilterId={hubAuraId}
        haloFilterId={medHaloId}
        idSeed={idSeed}
      >
        <circle cx={0} cy={0} r={innerR} fill={color} fillOpacity={0.92} />
      </TreeIconMedallion>
    </g>
  );
}

/**
 * Pursuit node — scaled `TreeGoalNodeSvg` anatomy: outer ring, dark core, inner glow, rim, centre dot.
 */
export function PreviewGoalNode({
  cx,
  cy,
  coreR,
  color,
  gradUid,
}: {
  cx: number;
  cy: number;
  coreR: number;
  color: string;
  gradUid: string;
}) {
  const scale = coreR / 20;
  const glowGradId = `spv-goal-glow-${gradUid}`;
  const glowAlpha = 0.36;
  const rimStrokeOpacity = 0.92;
  const glyphR = Math.max(2.8, 7 * scale);
  const outerRingR = coreR + 7 * scale;
  const rimW = 1.55 * scale;
  const outerRingW = 1.45 * scale;

  return (
    <g pointerEvents="none" aria-hidden>
      <defs>
        <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={1} />
          <stop offset="55%" stopColor={color} stopOpacity={0.62} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r={outerRingR}
        fill="none"
        stroke={color}
        strokeWidth={outerRingW}
        strokeOpacity={0.28}
      />
      <circle cx={cx} cy={cy} r={coreR} fill={TREE_CORE_FILL} fillOpacity={1} />
      <circle
        cx={cx}
        cy={cy}
        r={coreR * 0.94}
        fill={`url(#${glowGradId})`}
        fillOpacity={glowAlpha}
      />
      <circle
        cx={cx}
        cy={cy}
        r={coreR}
        fill="none"
        stroke={color}
        strokeWidth={rimW}
        strokeOpacity={rimStrokeOpacity}
      />
      <circle
        cx={cx}
        cy={cy}
        r={glyphR}
        fill={color}
        fillOpacity={0.95}
        stroke={TREE_CORE_FILL}
        strokeWidth={0.85 * scale}
        strokeOpacity={0.6}
      />
    </g>
  );
}

/** Timeline mark — filled dot on branch (`tree-svg` moment render). */
export function PreviewMarkDot({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={1} pointerEvents="none" aria-hidden />;
}

/**
 * Milestone orbital — incomplete orbital from `tree-render-goals-subtree` (halo + open ring).
 */
export function PreviewMilestoneOrbital({
  cx,
  cy,
  dotR,
  color,
}: {
  cx: number;
  cy: number;
  dotR: number;
  color: string;
}) {
  const haloR = dotR + 4 * (dotR / 7);
  return (
    <g pointerEvents="none" aria-hidden>
      <circle cx={cx} cy={cy} r={haloR} fill={color} fillOpacity={0.1} />
      <circle
        cx={cx}
        cy={cy}
        r={dotR}
        fill="none"
        stroke={color}
        strokeOpacity={0.82}
        strokeWidth={1.45 * (dotR / 7)}
      />
    </g>
  );
}

/** Organic pursuit spoke — cubic ease from `tree-render-goals-subtree` `childGoalSpokePathD`, simplified. */
export function previewBranchPathD(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  parentCx?: number,
  parentCy?: number,
): string {
  const ax = fromX;
  const ay = fromY;
  const cx = toX;
  const cy = toY;
  const dx = cx - ax;
  const dy = cy - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const pcx = parentCx ?? (ax + cx) / 2;
  const pcy = parentCy ?? (ay + cy) / 2;
  const c1x = ax + ux * dist * 0.36 + (pcx - ax) * 0.15;
  const c1y = ay + uy * dist * 0.36 + (pcy - ay) * 0.15;
  const c2x = cx - ux * dist * 0.3 + (pcx - cx) * 0.09;
  const c2y = cy - uy * dist * 0.3 + (pcy - cy) * 0.09;
  return `M ${ax} ${ay} C ${c1x},${c1y} ${c2x},${c2y} ${cx} ${cy}`;
}

export function previewHubDiscR(): number {
  return iconMedallionRadii(PREVIEW_HUB_ARTWORK_SPAN_PX, "domainHub").discR;
}
