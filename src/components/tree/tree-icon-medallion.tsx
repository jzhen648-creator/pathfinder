"use client";

import { useId, type ReactNode } from "react";

export type IconMedallionTier = "theme" | "domainHub" | "goal";

export type IconMedallionRadii = {
  /** Main disc — fully encloses square artwork bbox + padding. */
  discR: number;
  bloomR: number;
  tintR: number;
  highlightR: number;
};

/** Circumradius of a square icon bbox when artwork spans `artworkSpanPx` on screen. */
export function iconArtworkEnclosingRadius(artworkSpanPx: number): number {
  return artworkSpanPx * 0.5 * Math.SQRT2;
}

const TIER_PAD_PX: Record<IconMedallionTier, number> = {
  theme: 16,
  domainHub: 13,
  goal: 10,
};

const TIER_BLOOM_MUL: Record<IconMedallionTier, number> = {
  theme: 1.55,
  domainHub: 1.44,
  goal: 1.34,
};

/** Disc radii derived from on-screen artwork span — keeps the ring hugging the glyph, not a generic circle. */
export function iconMedallionRadii(artworkSpanPx: number, tier: IconMedallionTier): IconMedallionRadii {
  const discR = iconArtworkEnclosingRadius(artworkSpanPx) + TIER_PAD_PX[tier];
  return {
    discR,
    bloomR: discR * TIER_BLOOM_MUL[tier],
    tintR: discR * 0.96,
    highlightR: discR * 0.58,
  };
}

type GradientStop = readonly [offset: number, opacity: number];

type TierGradients = {
  bloom: readonly GradientStop[];
  body: readonly GradientStop[];
  wash: readonly GradientStop[];
  ring: number;
};

/** Radial falloff stops — smooth transitions instead of hard concentric fills. */
const TIER_GRADIENTS: Record<IconMedallionTier, TierGradients> = {
  theme: {
    bloom: [
      [0, 0.18],
      [0.38, 0.1],
      [0.68, 0.045],
      [1, 0],
    ],
    body: [
      [0, 0.9],
      [0.52, 0.76],
      [0.82, 0.34],
      [1, 0],
    ],
    wash: [
      [0, 0.42],
      [0.42, 0.28],
      [0.74, 0.1],
      [1, 0],
    ],
    ring: 0.34,
  },
  domainHub: {
    bloom: [
      [0, 0.22],
      [0.4, 0.13],
      [0.7, 0.06],
      [1, 0],
    ],
    body: [
      [0, 1],
      [0.54, 0.92],
      [0.84, 0.42],
      [1, 0],
    ],
    wash: [
      [0, 0.34],
      [0.44, 0.22],
      [0.76, 0.08],
      [1, 0],
    ],
    ring: 0.52,
  },
  goal: {
    bloom: [
      [0, 0.14],
      [0.42, 0.09],
      [0.72, 0.04],
      [1, 0],
    ],
    body: [
      [0, 0.86],
      [0.56, 0.72],
      [0.86, 0.28],
      [1, 0],
    ],
    wash: [
      [0, 0.28],
      [0.46, 0.18],
      [0.78, 0.07],
      [1, 0],
    ],
    ring: 0.42,
  },
};

function MedallionRadialGradient({
  id,
  cx,
  cy,
  r,
  color,
  dark,
  stops,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  dark?: boolean;
  stops: readonly GradientStop[];
}) {
  const base = dark ? "#070605" : color;
  return (
    <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
      {stops.map(([offset, opacity]) => (
        <stop key={offset} offset={`${Math.round(offset * 100)}%`} stopColor={base} stopOpacity={opacity} />
      ))}
    </radialGradient>
  );
}

type TreeIconMedallionProps = {
  cx: number;
  cy: number;
  color: string;
  artworkSpanPx: number;
  tier: IconMedallionTier;
  auraFilterId?: string;
  haloFilterId?: string;
  /** Stable SVG gradient id seed (SSR-safe); falls back to `useId`. */
  idSeed?: string;
  children: ReactNode;
};

function medallionSvgIdSeed(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Layered circular medallion sized to the icon artwork — radial gradients + ambient halo for smooth glow.
 */
export function TreeIconMedallion({
  cx,
  cy,
  color,
  artworkSpanPx,
  tier,
  auraFilterId = "treeGatewayIconAura",
  haloFilterId = "treeMedallionAmbientHalo",
  idSeed,
  children,
}: TreeIconMedallionProps) {
  const autoId = useId().replace(/:/g, "");
  const uid = idSeed != null ? medallionSvgIdSeed(idSeed) : autoId;
  const r = iconMedallionRadii(artworkSpanPx, tier);
  const grad = TIER_GRADIENTS[tier];
  const bloomId = `tree-med-bloom-${uid}`;
  const bodyId = `tree-med-body-${uid}`;
  const washId = `tree-med-wash-${uid}`;
  const sheenId = `tree-med-sheen-${uid}`;

  return (
    <g pointerEvents="none" aria-hidden>
      <defs>
        <MedallionRadialGradient id={bloomId} cx={cx} cy={cy} r={r.bloomR} color={color} stops={grad.bloom} />
        <MedallionRadialGradient id={bodyId} cx={cx} cy={cy} r={r.discR} color={color} dark stops={grad.body} />
        <MedallionRadialGradient id={washId} cx={cx} cy={cy} r={r.discR} color={color} stops={grad.wash} />
        <radialGradient id={sheenId} gradientUnits="userSpaceOnUse" cx={cx} cy={cy - r.discR * 0.12} r={r.highlightR}>
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="55%" stopColor={color} stopOpacity={0.08} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Outermost ambient — filter-blurred radial so the edge dissolves into the limb tint. */}
      <circle
        cx={cx}
        cy={cy}
        r={r.bloomR}
        fill={`url(#${bloomId})`}
        filter={`url(#${haloFilterId})`}
      />

      {/* Opaque disc occludes connective strokes at the hub boundary. */}
      {tier === "domainHub" || tier === "theme" ? (
        <circle cx={cx} cy={cy} r={r.discR * 1.02} fill="#0d0d0f" fillOpacity={1} />
      ) : null}

      {/* Dark body + color wash: overlapping soft gradients, not hard concentric rings. */}
      <circle cx={cx} cy={cy} r={r.discR} fill={`url(#${bodyId})`} />
      <circle cx={cx} cy={cy} r={r.discR} fill={`url(#${washId})`} />
      <circle cx={cx} cy={cy} r={r.highlightR} fill={`url(#${sheenId})`} />

      {/* Rim — very soft; most edge luminance comes from bloom + wash falloff. */}
      <circle
        cx={cx}
        cy={cy}
        r={r.discR * 0.98}
        fill="none"
        stroke={color}
        strokeOpacity={grad.ring}
        strokeWidth={tier === "theme" ? 1.6 : tier === "domainHub" ? 1.35 : 1.1}
      />

      <g transform={`translate(${cx},${cy})`}>
        <g filter={`url(#${auraFilterId})`} opacity={0.92}>
          {children}
        </g>
        {children}
      </g>
    </g>
  );
}
