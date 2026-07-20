import { normalizeCategoryLabelKey } from "@/lib/taxonomy";

export const AMOUNT_BASIS_VALUES = ["gross", "net"] as const;
export type AmountBasis = (typeof AMOUNT_BASIS_VALUES)[number];

export const AMOUNT_PERIOD_VALUES = ["year", "month"] as const;
export type AmountPeriod = (typeof AMOUNT_PERIOD_VALUES)[number];

/** @deprecated Prefer MetricProfile.shape — kept for existing call sites. */
export type AmountProfile = "none" | "flow" | "progress";

export type MetricShape = "flow" | "progress";

export type MetricKind = "currency" | "weight";

export type MetricProfile = {
  shape: MetricShape;
  kind: MetricKind;
  /** Canonical storage unit token (ISO currency code, kg, …). */
  defaultUnit: string;
  /** Flow income categories may also carry an optional target (salary goal). */
  flowAllowsTarget?: boolean;
};

const FINANCE_FLOW_KEYS = new Set([
  "pay from work",
  "property income",
  "business & freelance",
]);

const FINANCE_PROGRESS_KEYS = new Set([
  "assets & investing",
  "safety net & insurance",
  "debts & loans",
]);

const WEIGHT_PROGRESS_KEYS = new Set(["body care"]);

const FLOW_CATEGORY_KEYS = FINANCE_FLOW_KEYS;
const PROGRESS_CATEGORY_KEYS = FINANCE_PROGRESS_KEYS;

function financeFlowProfile(categoryLabel: string | null | undefined): MetricProfile {
  const period = defaultFlowPeriod(categoryLabel);
  return {
    shape: "flow",
    kind: "currency",
    defaultUnit: unitForAmount(period),
    flowAllowsTarget: true,
  };
}

export function categoryMetricProfile(
  themeId: string,
  categoryLabel: string | null | undefined,
): MetricProfile | null {
  if (!categoryLabel?.trim()) return null;
  const key = normalizeCategoryLabelKey(categoryLabel);

  if (themeId === "finance") {
    if (FINANCE_FLOW_KEYS.has(key)) return financeFlowProfile(categoryLabel);
    if (FINANCE_PROGRESS_KEYS.has(key)) {
      return { shape: "progress", kind: "currency", defaultUnit: "GBP" };
    }
    return null;
  }

  if (themeId === "health" && WEIGHT_PROGRESS_KEYS.has(key)) {
    return { shape: "progress", kind: "weight", defaultUnit: "kg" };
  }

  return null;
}

export function categoryAmountProfile(
  themeId: string,
  categoryLabel: string | null | undefined,
): AmountProfile {
  const profile = categoryMetricProfile(themeId, categoryLabel);
  if (!profile) return "none";
  return profile.shape;
}

/** Pay from work defaults to gross annual; property/freelance default to monthly. */
export function defaultFlowBasis(_categoryLabel: string | null | undefined): AmountBasis {
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

export function unitForAmount(period: AmountPeriod, currencyCode = "GBP"): string {
  return period === "year" ? `${currencyCode}/year` : `${currencyCode}/month`;
}

export function parseAmountPeriodFromUnit(unit: string | null | undefined): AmountPeriod | null {
  const normalized = (unit ?? "").trim().toLowerCase();
  if (normalized.includes("/year")) return "year";
  if (normalized.includes("/month")) return "month";
  return null;
}

export function parseCurrencyCodeFromUnit(unit: string | null | undefined): string | null {
  const normalized = (unit ?? "").trim();
  const match = /^([A-Z]{3})(?:\/|$)/i.exec(normalized);
  return match ? match[1]!.toUpperCase() : null;
}

export function parseFinanceAmountInput(input: string | null | undefined): number | null {
  if (!input?.trim()) return null;
  const cleaned = input.replace(/[£$€,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function currencyCodeForDisplay(unit: string | null | undefined): string {
  return parseCurrencyCodeFromUnit(unit) ?? "GBP";
}

export function formatCurrencyAmount(
  amount: number,
  unit?: string | null,
): string {
  const code = currencyCodeForDisplay(unit);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-GB")}`;
  }
}

/** @deprecated Prefer formatCurrencyAmount with unit — GBP-only helper. */
export function formatGbpAmount(amount: number): string {
  return formatCurrencyAmount(amount, "GBP");
}

/**
 * Direction-aware amount line for AI focal facts.
 * Labels remove guesswork about whether lower/higher is progress.
 */
export function formatDirectionAwareAmountFact(input: {
  themeId?: string | null;
  categoryLabel?: string | null;
  currentAmount?: number | null;
  targetAmount?: number | null;
  unit?: string | null;
}): string | null {
  const hasTarget = (input.targetAmount ?? 0) > 0;
  const hasCurrent = (input.currentAmount ?? 0) > 0;
  if (!hasTarget && !hasCurrent) return null;

  const unit = input.unit?.trim() ? ` ${input.unit.trim()}` : "";
  const key = normalizeCategoryLabelKey(input.categoryLabel ?? "");
  const metric = categoryMetricProfile(input.themeId ?? "", input.categoryLabel);

  let label = "Amount";
  let directionNote = "";

  if (key === "debts & loans") {
    label = "Debt remaining";
  } else if (key === "assets & investing" || key === "safety net & insurance") {
    label = "Saved";
  } else if (FLOW_CATEGORY_KEYS.has(key)) {
    label = "Income";
  } else if (metric?.kind === "weight" || key === "body care") {
    label = "Weight";
    if (
      hasCurrent &&
      hasTarget &&
      input.currentAmount != null &&
      input.targetAmount != null
    ) {
      if (input.currentAmount > input.targetAmount) {
        directionNote = " (reducing toward target)";
      } else if (input.currentAmount < input.targetAmount) {
        directionNote = " (increasing toward target)";
      }
    }
  }

  if (hasCurrent && hasTarget) {
    return `${label}: ${input.currentAmount}/${input.targetAmount}${unit}${directionNote}`;
  }
  if (hasTarget) {
    return `${label} target: ${input.targetAmount}${unit}`;
  }
  return `${label}: ${input.currentAmount}${unit}`;
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
      return `${formatCurrencyAmount(current, unit)} / ${formatCurrencyAmount(target, unit)}`;
    }
    if (target != null) return `Target ${formatCurrencyAmount(target, unit)}`;
    if (current != null) return formatCurrencyAmount(current, unit);
    return "Not set";
  }

  if (currentAmount == null) return "Not set";
  const period = parseAmountPeriodFromUnit(unit) ?? "year";
  const periodLabel = period === "year" ? "year" : "month";
  const basis =
    amountBasis === "gross" || amountBasis === "net" ? ` ${amountBasis}` : "";
  return `${formatCurrencyAmount(currentAmount, unit)}${basis}/${periodLabel}`;
}

export function amountBasisLabel(basis: AmountBasis): string {
  return basis === "gross" ? "Before tax (gross)" : "Take-home (net)";
}

/** @internal Kept for callers that still check raw finance progress keys. */
export { FLOW_CATEGORY_KEYS, PROGRESS_CATEGORY_KEYS };
