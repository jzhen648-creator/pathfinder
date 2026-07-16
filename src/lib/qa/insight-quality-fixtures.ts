import type { InsightQualityPayload } from "@/lib/qa/insight-quality-grade";

export type StaticQualityFixture = {
  id: string;
  expectPass: boolean;
  payload: InsightQualityPayload;
};

/** Canonical prose fixtures — no Gemini call required. */
export const STATIC_INSIGHT_QUALITY_FIXTURES: StaticQualityFixture[] = [
  {
    id: "tension-finance-pursuit",
    expectPass: true,
    payload: {
      pursuits: {
        "p-card": {
          headline: "Balance over £3,000 on minimum payments",
          body: "The balance is over £3,000 and the plan is set to the minimum, with the 0% period running out.",
          fromMap: "Plan is set to minimum; balance is over £3,000.",
        },
      },
    },
  },
  {
    id: "forecast-finance-pursuit",
    expectPass: false,
    payload: {
      pursuits: {
        "p-card": {
          headline: "Minimum payments on a large balance",
          body: "Relying on minimum payments might mean it takes longer to clear than anticipated, potentially pushing past the interest-free window.",
        },
      },
    },
  },
  {
    id: "status-narration-headline",
    expectPass: false,
    payload: {
      pursuits: {
        "p-cemap": {
          headline: "CeMAP qualification is an active pursuit",
          body: "Module 2 remains on the path.",
        },
      },
    },
  },
  {
    id: "theme-tension-pass",
    expectPass: true,
    payload: {
      themes: {
        finance: {
          oneLiner: "ISA target £500k with balance over £100k — contributions are set",
          reflective: "Build £500k ISA and Clear credit card debt are both active in Money & Finance.",
          combined: "ISA target and minimum payment plan compete for the same cash this month.",
        },
      },
    },
  },
  {
    id: "theme-filler-fail",
    expectPass: false,
    payload: {
      themes: {
        work: {
          oneLiner: "Work theme overview",
          reflective: "Connective tissue threads together CeMAP and the job search.",
        },
      },
    },
  },
  {
    id: "theme-riddle-fail",
    expectPass: false,
    payload: {
      themes: {
        finance: {
          oneLiner: "Contributions are set but the gap is the story.",
          reflective: "ISA remains the active Money & Finance chapter.",
        },
      },
    },
  },
  {
    id: "founder-isa-clear-pass",
    expectPass: true,
    payload: {
      themes: {
        finance: {
          oneLiner: "ISA balance is £30,000 against a £1,000,000 target — regular contributions are set.",
          reflective: "The shortfall remains large while contributions continue.",
        },
      },
      pursuits: {
        "p-isa": {
          headline: "£30,000 balance against a £1,000,000 target",
          body: "Regular contributions are set on the map.",
        },
        "p-app": {
          headline: "Formal Education completed at 17 before this apprenticeship began",
          body: "Training continues on the map after Formal Education.",
        },
      },
    },
  },
];
