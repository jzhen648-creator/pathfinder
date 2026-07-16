import { describe, expect, it } from "vitest";

import { gradeInsightQuality } from "@/lib/qa/insight-quality-grade";

describe("gradeInsightQuality", () => {
  it("flags forecast language in pursuit body", () => {
    const flags = gradeInsightQuality({
      pursuits: {
        p1: {
          headline: "Credit card balance is over £3,000",
          body: "Relying on minimum payments might mean it takes longer to clear than anticipated.",
        },
      },
    });
    expect(flags).toContain("banned-forecast:might mean");
  });

  it("passes tension-style pursuit copy", () => {
    const flags = gradeInsightQuality({
      pursuits: {
        p1: {
          headline: "Balance over £3,000 on minimum payments",
          body: "The balance is over £3,000 and the plan is set to the minimum, with the 0% period running out.",
        },
      },
    });
    expect(flags.filter((f) => f.startsWith("banned-"))).toEqual([]);
  });

  it("flags riddle closers in theme oneLiners", () => {
    const flags = gradeInsightQuality({
      themes: {
        finance: {
          oneLiner: "Contributions are set but the gap is the story.",
          reflective: "ISA remains active in Money & Finance.",
        },
      },
    });
    expect(flags.some((f) => f.startsWith("banned-riddle:"))).toBe(true);
  });

  it("flags administrative milestone and deadline inventory", () => {
    const flags = gradeInsightQuality({
      pursuits: {
        p1: {
          headline: "Deadline in 716 days; one of four milestones complete",
          body: "Training continues.",
        },
      },
    });
    expect(flags.some((f) => f.startsWith("banned-admin:"))).toBe(true);
  });

  it("flags status-narration headlines", () => {
    const flags = gradeInsightQuality({
      pursuits: {
        p1: { headline: "CeMAP is an active pursuit with a deadline", body: "Module 2 is next." },
      },
    });
    expect(flags).toContain("status-narration-headline:active pursuit");
  });

  it("flags forecast and filler in theme fields", () => {
    const flags = gradeInsightQuality({
      themes: {
        finance: {
          oneLiner: "Money theme is live",
          combined: "This could impact your financial flexibility next quarter.",
          reflective: "Connective tissue across ISA and debt pursuits.",
        },
      },
    });
    expect(flags).toContain("banned-forecast:could impact");
    expect(flags).toContain("banned-filler:connective tissue");
  });
});
