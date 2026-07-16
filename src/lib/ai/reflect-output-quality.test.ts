import { describe, expect, it } from "vitest";

import type { ReflectResponse } from "@/lib/ai/reflect-types";
import {
  gatePursuitComparison,
  hasWorthKnowingAnchor,
  looksLikeDefinitionalWorthKnowing,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";

const COMPLETE_PURSUIT_TITLE = "First Job as a Sales Negotiator";

const completeSignal: PursuitSignal = {
  title: COMPLETE_PURSUIT_TITLE,
  backgroundChars: 40,
  enrichAnswerCount: 1,
  milestoneCount: 2,
  completedMilestoneCount: 2,
  hasDeadline: false,
  hasQuantifiedTarget: false,
  status: "COMPLETE",
};

/** Compliant mock slice — patterns this tightening pass targets. */
const COMPLIANT_REFLECT_SLICE: ReflectResponse = {
  themes: {
    work: {
      tone: "encouraging",
      oneLiner: "CeMAP still has open units while the job search has a June deadline.",
      reflective:
        "Product Lead search and CeMAP qualification both sit in Job — the search has a June deadline while CeMAP still has units open.",
      contextual: "",
      combined: "",
    },
  },
  pursuits: {
    "p-sales": {
      tone: "arrival",
      headline: "Estate-agency negotiating experience now sits behind the degree on your map",
      body: "Your degree pursuit finished first; this role is the first paid step in the same Work & Career lane.",
      comparison:
        "Negotiating at an agency opens lender-panel broker routes — it bridges your degree and any CeMAP move on the map.",
      clarifiers: [],
      suggestedMilestones: null,
    },
  },
};

const BAD_REFLECT_SLICE: ReflectResponse = {
  themes: {
    work: {
      tone: "celebratory",
      oneLiner: "Both your degree and first sales role are complete.",
      reflective:
        "Your degree completed in April 2025 and First Job as a Sales Negotiator completed in June 2025 — both are Complete in Work & Career.",
      contextual: "",
      combined: "",
    },
  },
  pursuits: {
    "p-sales": {
      tone: "arrival",
      headline: "Your first sales negotiator role is complete, providing clarity and experience",
      body: "You completed your First Job as a Sales Negotiator at Estate Agency, a role you secured after your degree.",
      comparison:
        "A sales negotiator role in an estate agency typically involves matching clients with properties and conducting viewings.",
      clarifiers: [],
      suggestedMilestones: null,
    },
  },
};

function assertCompliantPursuitInsight(insight: ReflectResponse["pursuits"][string]) {
  expect(insight.headline.toLowerCase()).not.toMatch(/^\s*your .+ is complete\b/);
  expect(insight.headline.toLowerCase()).not.toMatch(/\bis complete\b.*providing/);
  expect(insight.body.startsWith(COMPLETE_PURSUIT_TITLE)).toBe(false);
  expect(looksLikeDefinitionalWorthKnowing(insight.comparison ?? "")).toBe(false);
  expect(
    gatePursuitComparison(insight.comparison ?? "", completeSignal),
  ).toBe(insight.comparison?.trim());
}

function assertCompliantThemeInsight(theme: ReflectResponse["themes"][string]) {
  const reflective = theme.reflective.toLowerCase();
    expect(theme.reflective.toLowerCase()).not.toMatch(/both are complete/);
  expect(reflective).not.toMatch(/completed in \w+ \d{4}.*completed in \w+ \d{4}/);
}

describe("reflect output quality guard", () => {
  it("compliant fixture passes headline, body, comparison, and theme reflective guards", () => {
    const pursuit = COMPLIANT_REFLECT_SLICE.pursuits["p-sales"];
    const theme = COMPLIANT_REFLECT_SLICE.themes.work;
    assertCompliantPursuitInsight(pursuit);
    assertCompliantThemeInsight(theme);
    expect(hasWorthKnowingAnchor(pursuit.comparison ?? "", completeSignal)).toBe(true);
  });

  it("bad fixture fails the same guards", () => {
    const pursuit = BAD_REFLECT_SLICE.pursuits["p-sales"];
    const theme = BAD_REFLECT_SLICE.themes.work;

    expect(pursuit.headline.toLowerCase()).toMatch(/\bis complete\b/);
    expect(pursuit.body.startsWith("You completed your First Job")).toBe(true);
    expect(looksLikeDefinitionalWorthKnowing(pursuit.comparison ?? "")).toBe(true);
    expect(gatePursuitComparison(pursuit.comparison ?? "", completeSignal)).toBe("");
    expect(theme.reflective.toLowerCase()).toMatch(/both are complete/);
  });
});
