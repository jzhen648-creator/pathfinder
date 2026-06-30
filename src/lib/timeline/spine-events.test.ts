import { describe, expect, it } from "vitest";

import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import {
  buildSpineEventsFromMapContext,
  countRecentCompletions,
  resolvePursuitCompleteDate,
} from "@/lib/timeline/spine-events";

const mapContext: FormattedMapContext = {
  themes: [
    {
      id: "work",
      label: "Work & Career",
      marks: [
        {
          id: "m1",
          title: "Promotion",
          description: "",
          sentiment: "positive",
          date: "2026-07-01",
        },
      ],
      categories: [
        {
          id: "cat-job",
          label: "Job",
          categoryLabel: "Job",
          marks: [],
          pursuits: [
            {
              id: "g1",
              title: "Senior role",
              status: "COMPLETE",
              significance: 4,
              completedAt: "2026-08-01",
              milestones: [
                {
                  id: "ms1",
                  title: "Offer signed",
                  completed: true,
                  completedAt: "2026-08-05",
                },
              ],
            },
            {
              id: "g2",
              title: "Next search",
              status: "ACTIVE",
              significance: 5,
              deadline: "2026-09-15",
              milestones: [],
            },
          ],
        },
      ],
    },
  ],
};

describe("spine-events", () => {
  it("builds past and future spine events", () => {
    const spine = buildSpineEventsFromMapContext(mapContext, {
      now: Date.parse("2026-08-20T00:00:00.000Z"),
    });
    expect(spine.past).toHaveLength(3);
    expect(spine.future).toHaveLength(1);
    expect(spine.past.some((e) => e.kind === "pursuit_complete")).toBe(true);
    expect(spine.past.find((e) => e.kind === "pursuit_complete")?.date).toBe("2026-08-05");
    expect(spine.future[0]?.kind).toBe("pursuit_deadline");
  });

  it("resolves pursuit complete date from milestones", () => {
    expect(
      resolvePursuitCompleteDate(mapContext.themes[0]!.categories[0]!.pursuits[0]!),
    ).toBe("2026-08-05");
  });

  it("counts recent completions within 90 days", () => {
    const pursuits = mapContext.themes[0]!.categories[0]!.pursuits;
    expect(
      countRecentCompletions(pursuits, { now: Date.parse("2026-08-20T00:00:00.000Z") }),
    ).toBe(1);
    expect(
      countRecentCompletions(pursuits, { now: Date.parse("2027-01-01T00:00:00.000Z") }),
    ).toBe(0);
  });
});
