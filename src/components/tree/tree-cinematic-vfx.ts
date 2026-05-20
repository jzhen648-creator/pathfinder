/**
 * Restrained bioluminescent VFX — aligns tree map glow with Claude Design handoff:
 * dark canvas, thin luminous conduits, soft single-layer blooms, calm inactive branches.
 */
const RAW = process.env.NEXT_PUBLIC_TREE_CINEMATIC_VFX?.toLowerCase();

/** Default on; set `NEXT_PUBLIC_TREE_CINEMATIC_VFX=0` in `.env.local` to revert legacy bloom stack. */
export const TREE_CINEMATIC_VFX_ENABLED = RAW !== "0" && RAW !== "false";

const LEGACY_LIMB_BACKDROP = {
  hullBleedOpacityMax: 0.075,
  hullPocketOpacityMax: 0.12,
  hullPolygonOpacity: 0.1,
  veilCenterOpacity: 0.26,
  veilFillOpacity: 0.2,
  veilMidOpacity: 0.14,
} as const;

export const TREE_CINEMATIC_VFX = {
  /** Skip pocket / bleed / filament hull noise — soft veil + optional hull wash only. */
  minimalLimbHull: true,
  mapBrightness: 1,
  atmosphereEcoHaze: 0.035,
  atmosphereDrift: 0.12,
  stageFalloff: 0.18,
  stageSouth: 0.12,
  stageEdgeVignette: 0.28,
  limbVeilMassBlur: 8,
  limbHullPolygonOpacity: 0.045,
  limbStemOuterOpacity: 0.18,
  limbStemMidOpacity: 0.4,
  limbStemCoreOpacity: 0.62,
  hubTrunkFilamentOpacityMul: 0.72,
  branchEnergyBlur: 1.15,
  branchUnderlayMul: 0.9,
  branchCoreOpacityCap: 0.62,
  branchWarmFilmMul: 0.58,
  branchMilestonePoolMul: 0.68,
  branchStemSegGlowMul: 0.82,
  medallionBloomRadiusMul: 1.08,
  medallionBodyPeakMul: 0.86,
  medallionWashPeakMul: 0.72,
  medallionRingMul: 0.86,
  gatewayAuraBlurMul: 0.78,
  medallionHaloBlurMul: 0.8,
  iconAuraPass: true,
} as const;

export function treeCinematicOpacity(base: number, channel: keyof typeof TREE_CINEMATIC_VFX): number {
  if (!TREE_CINEMATIC_VFX_ENABLED) return base;
  const mul = TREE_CINEMATIC_VFX[channel];
  if (typeof mul !== "number") return base;
  return base * mul;
}

export function limbBackdropVeilCenterOpacity(): number {
  return TREE_CINEMATIC_VFX_ENABLED
    ? LEGACY_LIMB_BACKDROP.veilCenterOpacity * 0.42
    : LEGACY_LIMB_BACKDROP.veilCenterOpacity;
}

export function limbBackdropVeilMidOpacity(): number {
  return TREE_CINEMATIC_VFX_ENABLED
    ? LEGACY_LIMB_BACKDROP.veilMidOpacity * 0.4
    : LEGACY_LIMB_BACKDROP.veilMidOpacity;
}

export function limbBackdropVeilFillOpacity(): number {
  return TREE_CINEMATIC_VFX_ENABLED
    ? LEGACY_LIMB_BACKDROP.veilFillOpacity * 0.35
    : LEGACY_LIMB_BACKDROP.veilFillOpacity;
}

export function limbBackdropHullPolygonOpacity(): number {
  return TREE_CINEMATIC_VFX_ENABLED
    ? TREE_CINEMATIC_VFX.limbHullPolygonOpacity
    : LEGACY_LIMB_BACKDROP.hullPolygonOpacity;
}

/** @deprecated pockets — unused when minimal hull */
export function limbBackdropHullPocketOpacityMax(): number {
  return LEGACY_LIMB_BACKDROP.hullPocketOpacityMax;
}

export function limbBackdropHullBleedOpacityMax(): number {
  return LEGACY_LIMB_BACKDROP.hullBleedOpacityMax;
}

export function cinematicBlurStd(base: number, scale = 1): number {
  if (!TREE_CINEMATIC_VFX_ENABLED) return base;
  return base * scale;
}

export function treeCinematicMinimalLimbHull(): boolean {
  return TREE_CINEMATIC_VFX_ENABLED && TREE_CINEMATIC_VFX.minimalLimbHull;
}
