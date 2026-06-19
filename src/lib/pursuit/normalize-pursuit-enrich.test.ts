import { describe, expect, it } from "vitest";

import { pursuitEnrichBatchSchema } from "@/lib/pursuit/pursuit-enrich-types";
import {
  normalizePursuitEnrichBatch,
  normalizePursuitEnrichEntry,
} from "@/lib/pursuit/normalize-pursuit-enrich";

const pursuitId = "p1";

describe("normalizePursuitEnrichEntry", () => {
  it("assigns milestone order from index when missing", () => {
    const milestonesOnly = normalizePursuitEnrichEntry({
      clarifiers: [],
      insight: null,
      suggestedMilestones: [{ title: "First step" }, { title: "Second", position: 2 }],
    }) as {
      suggestedMilestones: Array<{ title: string; order: number }> | null;
    };
    expect(milestonesOnly.suggestedMilestones?.[0].order).toBe(0);
    expect(milestonesOnly.suggestedMilestones?.[1].order).toBe(2);
  });

  it("coerces string milestone list", () => {
    const stringMilestones = normalizePursuitEnrichEntry({
      clarifiers: [],
      insight: null,
      suggestedMilestones: ["Apply", "Interview"],
    });
    expect(stringMilestones?.suggestedMilestones).toEqual([
      { title: "Apply", order: 0 },
      { title: "Interview", order: 1 },
    ]);
  });

  it("nests flat insight fields at top level", () => {
    const flatInsight = normalizePursuitEnrichEntry({
      tone: "reality check",
      headline: "Behind pace",
      body: "Two milestones remain.",
      clarifiers: [],
      suggestedMilestones: null,
    });
    expect(flatInsight?.insight).toEqual({
      tone: "context",
      headline: "Behind pace",
      body: "Two milestones remain.",
    });
  });

  it("normalizes clarifier option drift", () => {
    const clarifiers = normalizePursuitEnrichEntry({
      clarifiers: [
        {
          prompt: "What kind of role?",
          options: [{ label: "Tech" }],
        },
      ],
      insight: null,
      suggestedMilestones: null,
    }) as { clarifiers: Array<{ id: string; options: string[] }> };
    expect(clarifiers.clarifiers).toHaveLength(1);
    expect(clarifiers.clarifiers[0].options).toEqual(["Tech", "Not sure"]);
    expect(clarifiers.clarifiers[0].id).toBeTruthy();
  });

  it("drops clarifiers with fewer than two options", () => {
    const result = normalizePursuitEnrichEntry({
      clarifiers: [{ prompt: "Empty?", options: [] }],
      insight: null,
      suggestedMilestones: null,
    }) as { clarifiers: unknown[] };
    expect(result.clarifiers).toEqual([]);
  });

  it("truncates long insight headline and body", () => {
    const result = normalizePursuitEnrichEntry({
      headline: "x".repeat(150),
      body: "y".repeat(600),
      clarifiers: [],
      suggestedMilestones: null,
    }) as { insight: { headline: string; body: string } };
    expect(result.insight.headline.length).toBe(100);
    expect(result.insight.body.length).toBe(500);
  });

  it("coerces milestone order from string position", () => {
    const result = normalizePursuitEnrichEntry({
      clarifiers: [],
      insight: null,
      suggestedMilestones: [{ title: "Step", position: "3" }],
    }) as { suggestedMilestones: Array<{ order: number }> | null };
    expect(result.suggestedMilestones?.[0].order).toBe(3);
  });
});

describe("normalizePursuitEnrichBatch", () => {
  it("passes Zod after normalize", () => {
    const batch = normalizePursuitEnrichBatch({
      pursuits: {
        [pursuitId]: {
          tone: "in_focus",
          headline: "Good momentum",
          body: "Keep going.",
          clarifiers: [],
          suggestedMilestones: [{ title: "Next step" }],
        },
      },
    });
    const parsed = pursuitEnrichBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(true);
  });

  it("drops invalid pursuit entries", () => {
    const batch = normalizePursuitEnrichBatch({
      pursuits: {
        valid: {
          tone: "in_focus",
          headline: "Ok",
          body: "Body",
          clarifiers: [],
          suggestedMilestones: null,
        },
        invalid: null,
      },
    }) as { pursuits: Record<string, unknown> };
    expect(Object.keys(batch.pursuits)).toEqual(["valid"]);
  });
});
