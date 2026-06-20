import { describe, expect, it } from "vitest";

import {
  AMOUNT_IMPACT_PROSE_MARKER,
  amountImpactBodyPromptLines,
  amountImpactReadingPromptLines,
  countAmountTrackedPursuits,
  isAmountImpactEligible,
  pursuitHasAmountField,
} from "@/lib/ai/amount-impact-eligibility";
import {
  buildReflectPursuitsOnlySystemPrompt,
  buildReflectSystemPrompt,
} from "@/lib/ai/generate-reflect";
import { buildEnrichSystemPrompt } from "@/lib/pursuit/generate-pursuit-enrich";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";

function pursuit(
  id: string,
  amounts: { targetAmount?: number; currentAmount?: number } = {},
) {
  return {
    id,
    title: id,
    description: "",
    status: "ACTIVE",
    significance: 3,
    milestones: [],
    ...amounts,
  };
}

function mapContext(...items: Array<{ hubId: string; pursuits: ReturnType<typeof pursuit>[] }>): FormattedMapContext {
  return {
    themes: [
      {
        id: "finance",
        label: "Finance",
        marks: [],
        hubs: items.map((item) => ({
          id: item.hubId,
          label: item.hubId,
          section: "",
          pursuits: item.pursuits,
          marks: [],
        })),
      },
    ],
  };
}

describe("amount impact eligibility", () => {
  it("counts pursuits with targetAmount or currentAmount", () => {
    expect(pursuitHasAmountField({ targetAmount: 1000 })).toBe(true);
    expect(pursuitHasAmountField({ currentAmount: 50 })).toBe(true);
    expect(pursuitHasAmountField({})).toBe(false);
  });

  it("requires at least two amount-tracked pursuits", () => {
    const one = mapContext({ hubId: "savings", pursuits: [pursuit("a", { targetAmount: 1000 })] });
    const two = mapContext({
      hubId: "savings",
      pursuits: [
        pursuit("a", { targetAmount: 1000 }),
        pursuit("b", { currentAmount: 200 }),
      ],
    });

    expect(countAmountTrackedPursuits(one)).toBe(1);
    expect(isAmountImpactEligible(one)).toBe(false);
    expect(isAmountImpactEligible(two)).toBe(true);
  });
});

describe("amount impact prompt wiring", () => {
  it("omits rules when ineligible", () => {
    expect(amountImpactReadingPromptLines(false)).toEqual([]);
    expect(amountImpactBodyPromptLines(false)).toEqual([]);
    expect(buildEnrichSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, false, false)).not.toContain(
      AMOUNT_IMPACT_PROSE_MARKER,
    );
  });

  it("includes rules in enrich and reflect prompts when eligible", () => {
    expect(buildEnrichSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, false, true)).toContain(
      AMOUNT_IMPACT_PROSE_MARKER,
    );
    expect(buildReflectPursuitsOnlySystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, true)).toContain(
      AMOUNT_IMPACT_PROSE_MARKER,
    );
    expect(buildReflectSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, "full", true)).toContain(
      AMOUNT_IMPACT_PROSE_MARKER,
    );
  });

  it("adds amount-impact rules to reflect pursuit-body section when eligible", () => {
    const prompt = buildReflectSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, "full", true);

    expect(prompt).toContain(AMOUNT_IMPACT_PROSE_MARKER);
    expect(buildReflectPursuitsOnlySystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, true)).toContain(
      AMOUNT_IMPACT_PROSE_MARKER,
    );
  });
});
