/** Deterministic limb-color derivatives for jewel-like highlights (no procedural noise). */

import { TREE_MAP_SURFACE_RGB } from "./tree-view-constants";

export type Rgb = { r: number; g: number; b: number };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseHexRgb(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) return null;
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) return null;
    return { r, g, b };
  }
  return null;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("")}`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

/** Linear saturation boost around luminance (simple “richer magentas / branch tones”). */
export function saturateRgbAroundLuma(c: Rgb, factor: number): Rgb {
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const f = Math.max(0.35, factor);
  return {
    r: lum + (c.r - lum) * f,
    g: lum + (c.g - lum) * f,
    b: lum + (c.b - lum) * f,
  };
}

/** Pull chroma toward grey at the same luminance (`t` = 1 → neutral). For BLOOMED goal recession. */
export function desaturateRgbTowardLuma(c: Rgb, t: number): Rgb {
  const u = Math.max(0, Math.min(1, t));
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return {
    r: c.r + (lum - c.r) * u,
    g: c.g + (lum - c.g) * u,
    b: c.b + (lum - c.b) * u,
  };
}

const INNER_BLOOM_HOT: Rgb = { r: 255, g: 244, b: 252 };

/** Tiny hot reads for hub / petal stem / membrane crease (additive-leaning, not large glows). */
export const JEWEL_CORE_HOT_HEX = "#FFFAFC";
export const JEWEL_CORE_PINK_HEX = "#FFE4F2";

/** Hub-trunk simplified spine — warm amber/brown base, muted toward crown. */
export const TRUNK_WARM_BASE_HEX = "#8b7355";
export const TRUNK_WARM_MID_HEX = "#7a6a52";
export const TRUNK_WARM_CROWN_HEX = "#6a5e4a";
export const TRUNK_WARM_VEIN_HEX = "#c4a882";
export const TRUNK_WARM_ROOT_HEX = "#5c4a38";

/** Faint limb accent bleed at trunk junction discs (5–10% mix). */
export function trunkJunctionTintHex(areaHex: string, mix01 = 0.08): string {
  const base = parseHexRgb(areaHex);
  const trunk = parseHexRgb(TRUNK_WARM_MID_HEX);
  if (!base || !trunk) return TRUNK_WARM_MID_HEX;
  return rgbToHex(mixRgb(trunk, base, Math.max(0, Math.min(0.14, mix01))));
}

/** Limb territory fill — keep most of the limb accent so membranes read as colored regions. */
export function limbBackdropSurfaceTint(areaHex: string, towardCanvas = 0.26): string {
  const base = parseHexRgb(areaHex);
  if (!base) return areaHex;
  return rgbToHex(mixRgb(base, TREE_MAP_SURFACE_RGB, Math.max(0, Math.min(1, towardCanvas))));
}

/**
 * Inner petal / jewel stop: biased toward soft bloom-white with chroma lift from limb hue.
 */
export function limbJewelHighlightStopColor(baseHex: string, chromaMix: number): string {
  const base = parseHexRgb(baseHex);
  if (!base) return rgbToHex(INNER_BLOOM_HOT);
  const sat = saturateRgbAroundLuma(base, 1 + chromaMix * 0.55);
  const t = 0.38 + chromaMix * 0.28;
  return rgbToHex(mixRgb(sat, INNER_BLOOM_HOT, t));
}

/** Saturated mid-energy band between hot highlights and violet rim (material depth). */
export function limbMidEnergyBandHex(baseHex: string, chromaLift: number): string {
  const base = parseHexRgb(baseHex);
  if (!base) return baseHex;
  const sat = saturateRgbAroundLuma(base, 1.12 + chromaLift * 0.55);
  return rgbToHex(mixRgb(sat, INNER_BLOOM_HOT, 0.12));
}

/** Deep absorption pocket outside luminous core — cooler, darker rim. */
export function limbCoherenceAbsorptionEdgeHex(baseHex: string, depth: number): string {
  const base = parseHexRgb(baseHex);
  const deep: Rgb = { r: 22, g: 10, b: 34 };
  if (!base) return rgbToHex(deep);
  const t = Math.max(0.35, Math.min(1, depth));
  return rgbToHex(mixRgb(base, deep, t));
}

/** Petal / membrane edge depth — violet bias (not flat pink fog). */
export function limbPetalShadowStopColor(baseHex: string, mix: number): string {
  const base = parseHexRgb(baseHex);
  const deep: Rgb = { r: 34, g: 16, b: 48 };
  if (!base) return rgbToHex(deep);
  return rgbToHex(mixRgb(base, deep, Math.max(0, Math.min(1, mix))));
}

export function limbMembraneSparkleStroke(baseHex: string, mix: number): string {
  const base = parseHexRgb(baseHex);
  if (!base || mix <= 0.001) return baseHex;
  const frost: Rgb = { r: 255, g: 252, b: 254 };
  return rgbToHex(mixRgb(base, frost, Math.min(1, mix)));
}
