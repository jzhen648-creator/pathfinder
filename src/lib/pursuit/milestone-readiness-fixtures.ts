import type { MilestoneReadinessInput } from "@/lib/pursuit/milestone-readiness";

/** Shared parity fixtures — keep in sync with pathfinder-mobile/lib/pursuit/milestone-readiness-fixtures.ts */
export type MilestoneReadinessFixture = {
  label: string;
  input: MilestoneReadinessInput;
  expectedReady: boolean;
};

export const MILESTONE_READINESS_FIXTURES: MilestoneReadinessFixture[] = [
  {
    label: "thin title only",
    input: { title: "Apprenticeship", background: null, enrichAnswerCount: 0 },
    expectedReady: false,
  },
  {
    label: "long filler note",
    input: {
      title: "Apprenticeship",
      background:
        "i really want to do this it will be good and fun for my career development goals and i am excited",
      enrichAnswerCount: 0,
    },
    expectedReady: false,
  },
  {
    label: "specific title but thin combined context",
    input: {
      title: "Level 3 CeMAP apprenticeship at Kaplan",
      background: null,
      enrichAnswerCount: 0,
    },
    expectedReady: false,
  },
  {
    label: "one answered question with modest context",
    input: {
      title: "Level 3 apprenticeship",
      background: "Kaplan college, CeMAP route.",
      enrichAnswerCount: 1,
    },
    expectedReady: true,
  },
  {
    label: "rich note without quick question",
    input: {
      title: "Software apprenticeship",
      background:
        "Level 3 Digital Technology Solutions at Manchester College, started September 2024, employer Acme Ltd.",
      enrichAnswerCount: 0,
    },
    expectedReady: true,
  },
];
