import type { FormattedMapContext, FormattedMapPursuit } from "@/lib/ai/format-map-context";

/** Test marker — cross-pursuit relative-weight prose rules. */
export const AMOUNT_IMPACT_PROSE_MARKER = "cross-pursuit relative-weight";

export function pursuitHasAmountField(
  pursuit: Pick<FormattedMapPursuit, "targetAmount" | "currentAmount">,
): boolean {
  return pursuit.targetAmount != null || pursuit.currentAmount != null;
}

export function countAmountTrackedPursuits(mapContext: FormattedMapContext): number {
  let count = 0;
  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      for (const pursuit of hub.pursuits) {
        if (pursuitHasAmountField(pursuit)) {
          count += 1;
        }
      }
    }
  }
  return count;
}

/** True when ≥2 pursuits have targetAmount and/or currentAmount populated. */
export function isAmountImpactEligible(mapContext: FormattedMapContext): boolean {
  return countAmountTrackedPursuits(mapContext) >= 2;
}

function amountImpactProseCore(): string[] {
  return [
    "AMOUNT IMPACT PROSE (enabled — ≥2 pursuits on the map have targetAmount and/or currentAmount):",
    "- Prose only — never add JSON fields; never infer or write significance.",
    `- Include at most one ${AMOUNT_IMPACT_PROSE_MARKER} observation using amounts and units verbatim from map context.`,
    "- Compare how amount-tracked pursuits weigh against each other (e.g. a smaller contribution toward a larger target elsewhere).",
    "- Omit north-star, life-identity, or abstract framing — concrete map-relative weight only.",
  ];
}

export function amountImpactReadingPromptLines(eligible: boolean): string[] {
  if (!eligible) return [];
  return [
    "",
    ...amountImpactProseCore(),
    "- Apply in whole-map reading / seasonRead when amount fields appear in map context or reading packet.",
  ];
}

export function amountImpactBodyPromptLines(eligible: boolean): string[] {
  if (!eligible) return [];
  return [
    "",
    ...amountImpactProseCore(),
    "- Apply in pursuit insight body when the focal pursuit or sibling pursuits carry amount fields in context.",
  ];
}
