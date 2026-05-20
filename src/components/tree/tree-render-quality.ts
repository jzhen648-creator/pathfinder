import { FLAGS } from "@/lib/flags";

export type TreeRenderQuality = "restrained" | "balanced" | "cinematic";

/**
 * Luminous hierarchy presets (jewel cores, tighter fields, richer petals).
 *
 * **Disconnected:** factor tables are defined here but not yet applied in the SVG renderer
 * (`tree-goal-visual.tsx` / `tree-render-goals-subtree.tsx`). Use {@link FLAGS.TREE_GOAL_RENDER_QUALITY}
 * for the active preset until wiring lands; the dev-toolbar preset picker was removed until then.
 */
export type TreeRenderQualityFactors = {
  /** Ellipse rx/ry scale for coherence veils (↓ = tighter local bloom). */
  fieldRadiusMul: number;
  /** Multiply field ellipse fillOpacity. */
  fieldOpacityMul: number;
  /** Outer radial gradient r=“NN%” — lower = faster edge falloff. */
  fieldOuterGradientRPct: number;
  /** Inner radial gradient r %. */
  fieldInnerGradientRPct: number;
  /** Multiply radial gradient stop alphas (concentrated vs foggy). */
  fieldGradientPeakMul: number;
  /** Scale orbital undershape template fill opacities (before slot calmMul). */
  orbitalGlowMul: number;
  /** Bloomed/growing: undershape radius squeeze for denser petal cores. */
  bloomedMidGlowRadiusMul: number;
  membraneFillMul: number;
  membraneStrokeMul: number;
  /** 0–1 mix membrane stroke color toward cool white (jewel sparkle read). */
  membraneSparkleMix: number;
  arcOpacityMul: number;
  arcOpacityCapMul: number;
  /** Extra jewel stop along petal axial gradient (0 = off). */
  petalJewelStopStrength: number;
  petalFillOpacityMul: number;
  /** Saturate limb color for hot highlights (via tree-color-accents). */
  petalChromaMix: number;
  structuralLineMul: number;
  attachMul: number;
  coreJewelMul: number;
  incompleteRingOpacityMul: number;
  branchVitalityMul: number;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

const RESTRAINED: TreeRenderQualityFactors = {
  fieldRadiusMul: 1.06,
  fieldOpacityMul: 0.68,
  fieldOuterGradientRPct: 88,
  fieldInnerGradientRPct: 72,
  fieldGradientPeakMul: 0.78,
  orbitalGlowMul: 0.72,
  bloomedMidGlowRadiusMul: 1.04,
  membraneFillMul: 0.78,
  membraneStrokeMul: 0.8,
  membraneSparkleMix: 0,
  arcOpacityMul: 0.85,
  arcOpacityCapMul: 0.88,
  petalJewelStopStrength: 0,
  petalFillOpacityMul: 0.82,
  petalChromaMix: 0,
  structuralLineMul: 0.88,
  attachMul: 0.82,
  coreJewelMul: 0.82,
  incompleteRingOpacityMul: 0.9,
  branchVitalityMul: 0.85,
};

const BALANCED: TreeRenderQualityFactors = {
  /** Balance: canopy reads first at scale; fields stay local to goals. */
  fieldRadiusMul: 0.72,
  fieldOpacityMul: 0.78,
  fieldOuterGradientRPct: 74,
  fieldInnerGradientRPct: 56,
  fieldGradientPeakMul: 1.14,
  orbitalGlowMul: 1,
  bloomedMidGlowRadiusMul: 0.94,
  membraneFillMul: 1,
  membraneStrokeMul: 1,
  membraneSparkleMix: 0.12,
  arcOpacityMul: 1,
  arcOpacityCapMul: 1,
  petalJewelStopStrength: 0.28,
  petalFillOpacityMul: 1.06,
  petalChromaMix: 0.1,
  structuralLineMul: 1,
  attachMul: 1,
  coreJewelMul: 1.08,
  incompleteRingOpacityMul: 1,
  branchVitalityMul: 1,
};

const CINEMATIC: TreeRenderQualityFactors = {
  fieldRadiusMul: 0.56,
  fieldOpacityMul: 1.28,
  fieldOuterGradientRPct: 56,
  fieldInnerGradientRPct: 44,
  fieldGradientPeakMul: 1.62,
  orbitalGlowMul: 1.52,
  bloomedMidGlowRadiusMul: 0.82,
  membraneFillMul: 1.34,
  membraneStrokeMul: 1.42,
  membraneSparkleMix: 0.28,
  arcOpacityMul: 1.22,
  arcOpacityCapMul: 1.12,
  petalJewelStopStrength: 0.72,
  petalFillOpacityMul: 1.34,
  petalChromaMix: 0.16,
  structuralLineMul: 1.22,
  attachMul: 1.38,
  coreJewelMul: 1.42,
  incompleteRingOpacityMul: 1.06,
  branchVitalityMul: 1.22,
};

export const TREE_RENDER_QUALITY_FACTORS: Record<TreeRenderQuality, TreeRenderQualityFactors> = {
  restrained: RESTRAINED,
  balanced: BALANCED,
  cinematic: CINEMATIC,
};

export function getTreeRenderQuality(): TreeRenderQuality {
  const q = FLAGS.TREE_GOAL_RENDER_QUALITY;
  if (q === "restrained" || q === "balanced" || q === "cinematic") return q;
  return "balanced";
}

export function getTreeRenderQualityFactors(): TreeRenderQualityFactors {
  return TREE_RENDER_QUALITY_FACTORS[getTreeRenderQuality()];
}

/**
 * Resolves factors for a preset name. Prefer {@link getTreeRenderQualityFactors} for the flag default.
 * `devPreset` is reserved for a future dev override once factors are wired into rendering.
 */
export function resolveTreeRenderQualityFactors(
  devPreset: TreeRenderQuality | null | undefined,
): TreeRenderQualityFactors {
  if (devPreset === "restrained" || devPreset === "balanced" || devPreset === "cinematic") {
    return TREE_RENDER_QUALITY_FACTORS[devPreset];
  }
  return getTreeRenderQualityFactors();
}

/** Clamp slot / membrane numeric outputs after quality scaling to avoid SVG blow-out. */
export function clampBloomOpacity(x: number, cap = 0.14): number {
  return clamp(x, 0, cap);
}
