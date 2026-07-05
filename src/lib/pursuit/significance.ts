/** Chapter significance scale — 1 Background, 2 Meaningful, 3 Pivotal. */
export const SIGNIFICANCE_MAX = 3;
export const SIGNIFICANCE_DEFAULT = 2;
export const SIGNIFICANCE_LABELS = ["Background", "Meaningful", "Pivotal"] as const;

export function clampSignificance(value?: number | null, fallback = SIGNIFICANCE_DEFAULT): number {
  return Math.min(SIGNIFICANCE_MAX, Math.max(1, Math.round(value ?? fallback)));
}

export function significanceWordLabel(value: number): string {
  const level = clampSignificance(value);
  return SIGNIFICANCE_LABELS[level - 1] ?? SIGNIFICANCE_LABELS[1];
}
