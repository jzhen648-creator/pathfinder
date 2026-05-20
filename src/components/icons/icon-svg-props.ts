export const ICON_DESIGN_SIZE = 24;

export interface IconSvgProps {
  /** Rendered width/height in px (square). Default 24. */
  size?: number;
  opacity?: number;
  /** Passed to stroke/fill; default currentColor for CSS inheritance. */
  color?: string;
  /** Desired on-screen SVG stroke width in px for fixed-stroke artwork. */
  stroke?: number;
}

export function iconScale(size: number): number {
  return size / ICON_DESIGN_SIZE;
}

/**
 * Stroke weight in **pre-transform** units. Icons live inside `<g transform="scale(s)">` (s = size/24),
 * so any stroke is multiplied by `s` again on screen. To get a perceptually balanced **square-root**
 * growth (`screenStroke = baseWidth * √s`), the pre-transform value must be `baseWidth / √s`.
 *
 * At the design size (size = 24, s = 1) this reduces to `baseWidth` — unchanged.
 * At size = 56 (s ≈ 2.33) the screen stroke is `baseWidth * 1.53` instead of `baseWidth * 5.44`.
 * At small sizes (size = 16, s ≈ 0.67) the screen stroke is `baseWidth * 0.82` instead of `0.45` —
 * keeps hairlines from disappearing.
 */
export function scaleStroke(baseWidth: number, size: number): number {
  const s = iconScale(size);
  if (s <= 0) return baseWidth;
  return baseWidth / Math.sqrt(s);
}

export function fixedScreenStroke(strokeWidth: number, size: number): number {
  const s = iconScale(size);
  if (s <= 0) return strokeWidth;
  return strokeWidth / s;
}
