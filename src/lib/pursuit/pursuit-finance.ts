/** Pull a GBP figure from prose — monthly income/rent updates, etc. */
export function extractPrimaryGbpAmount(text: string): number | null {
  const normalized = text.replace(/\u00a0/g, " ");
  const patterns = [
    /£\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*mo(?:nth)?|pm|per month)?/i,
    /([\d,]+(?:\.\d+)?)\s*(?:gbp|£)\s*(?:\/\s*mo(?:nth)?|pm|per month)?/i,
    /(?:rent|income|yield(?:s)?|earning(?:s)?|receives?|getting|at)\s*(?:of|around|about|roughly)?\s*£?\s*([\d,]+(?:\.\d+)?)/i,
    /£\s*([\d,]+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0 && value < 1_000_000_000) {
      return value;
    }
  }
  return null;
}

export function financeAmountUnitFromText(text: string): string {
  if (/\b(per year|\/yr|annually|annual)\b/i.test(text)) return "GBP/year";
  if (/\b(per week|\/wk|weekly)\b/i.test(text)) return "GBP/week";
  return "GBP/month";
}

export function syncFinanceMetricsFromProse(
  description: string,
): { currentAmount: number; unit: string } | null {
  const amount = extractPrimaryGbpAmount(description);
  if (amount == null) return null;
  return {
    currentAmount: amount,
    unit: financeAmountUnitFromText(description),
  };
}
