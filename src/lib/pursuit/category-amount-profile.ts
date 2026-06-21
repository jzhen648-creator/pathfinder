import { normalizeCategoryLabelKey } from "@/lib/taxonomy";

export const AMOUNT_BASIS_VALUES = ["gross", "net"] as const;
export type AmountBasis = (typeof AMOUNT_BASIS_VALUES)[number];

export const AMOUNT_PERIOD_VALUES = ["year", "month"] as const;
export type AmountPeriod = (typeof AMOUNT_PERIOD_VALUES)[number];

export type AmountProfile = "none" | "flow" | "progress";

const FLOW_CATEGORY_KEYS = new Set([
  "pay from work",
  "property income",
  "business & freelance",
]);

const PROGRESS_CATEGORY_KEYS = new Set([
  "assets & investing",
  "safety net & insurance",
  "debts & loans",
]);

export function categoryAmountProfile(
  themeId: string,
  categoryLabel: string | null | undefined,
): AmountProfile {
  if (themeId !== "finance" || !categoryLabel?.trim()) return "none";
  const key = normalizeCategoryLabelKey(categoryLabel);
  if (FLOW_CATEGORY_KEYS.has(key)) return "flow";
  if (PROGRESS_CATEGORY_KEYS.has(key)) return "progress";
  return "none";
}

/** Pay from work defaults to gross annual; property/freelance default to monthly. */
export function defaultFlowBasis(categoryLabel: string | null | undefined): AmountBasis {
  return "gross";
}

export function defaultFlowPeriod(categoryLabel: string | null | undefined): AmountPeriod {
  const key = normalizeCategoryLabelKey(categoryLabel ?? "");
  return key === "pay from work" ? "year" : "month";
}

export function flowCategoryShowsBasis(categoryLabel: string | null | undefined): boolean {
  const key = normalizeCategoryLabelKey(categoryLabel ?? "");
  return key === "pay from work" || key === "business & freelance";
}

export function unitForAmount(period: AmountPeriod): string {
  return period === "year" ? "GBP/year" : "GBP/month";
}

export function parseAmountPeriodFromUnit(unit: string | null | undefined): AmountPeriod | null {
  const normalized = (unit ?? "").trim().toLowerCase();
  if (normalized.includes("/year")) return "year";
  if (normalized.includes("/month")) return "month";
  return null;
}

export function parseFinanceAmountInput(input: string | null | undefined): number | null {
  if (!input?.trim()) return null;
  const cleaned = input.replace(/[£,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatGbpAmount(amount: number): string {
  return `£${amount.toLocaleString("en-GB")}`;
}

export type AmountDisplayInput = {
  profile: AmountProfile;
  currentAmount?: number | null;
  targetAmount?: number | null;
  unit?: string | null;
  amountBasis?: string | null;
};

export function formatPursuitAmountLabel(input: AmountDisplayInput): string | null {
  const { profile, currentAmount, targetAmount, unit, amountBasis } = input;
  if (profile === "none") return null;

  if (profile === "progress") {
    const target = targetAmount ?? null;
    const current = currentAmount ?? null;
    if (target == null && current == null) return "Not set";
    if (target != null && current != null) {
      return `${formatGbpAmount(current)} / ${formatGbpAmount(target)}`;
    }
    if (target != null) return `Target ${formatGbpAmount(target)}`;
    if (current != null) return formatGbpAmount(current);
    return "Not set";
  }

  if (currentAmount == null) return "Not set";
  const period = parseAmountPeriodFromUnit(unit) ?? "year";
  const periodLabel = period === "year" ? "year" : "month";
  const basis =
    amountBasis === "gross" || amountBasis === "net" ? ` ${amountBasis}` : "";
  return `${formatGbpAmount(currentAmount)}${basis}/${periodLabel}`;
}

export function amountBasisLabel(basis: AmountBasis): string {
  return basis === "gross" ? "Before tax (gross)" : "Take-home (net)";
}
