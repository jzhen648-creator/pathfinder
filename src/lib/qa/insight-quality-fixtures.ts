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
          body: "The 0% period is running out — those two facts sit in tension.",
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
          oneLiner: "ISA target and debt payoff share the same month",
          reflective: "Build £500k ISA and Clear credit card debt are both active in Money & Finance.",
          combined: "The ISA target and minimum payment plan sit in tension — same cash, two directions.",
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
];
