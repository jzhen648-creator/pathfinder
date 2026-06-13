import assert from "node:assert/strict";

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
      hubs: [
        {
          id: "cat-job",
          label: "Job",
          section: "Job",
          marks: [],
          pursuits: [
            {
              id: "g1",
              title: "Senior role",
              description: "",
              status: "COMPLETE",
              significance: 4,
              completedAt: "2026-08-01",
              milestones: [{ id: "ms1", title: "Offer signed", completed: true, completedAt: "2026-08-05" }],
            },
            {
              id: "g2",
              title: "Next search",
              description: "",
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

const spine = buildSpineEventsFromMapContext(mapContext, { now: Date.parse("2026-08-20T00:00:00.000Z") });
assert.equal(spine.past.length, 2);
assert.equal(spine.future.length, 1);
assert.equal(spine.past[0]?.kind, "pursuit_complete");
assert.equal(spine.past[0]?.date, "2026-08-05");
assert.equal(spine.future[0]?.kind, "pursuit_deadline");

assert.equal(
  resolvePursuitCompleteDate(mapContext.themes[0]!.hubs[0]!.pursuits[0]!),
  "2026-08-05",
);

const pursuits = mapContext.themes[0]!.hubs[0]!.pursuits;
assert.equal(countRecentCompletions(pursuits, { now: Date.parse("2026-08-20T00:00:00.000Z") }), 1);
assert.equal(countRecentCompletions(pursuits, { now: Date.parse("2027-01-01T00:00:00.000Z") }), 0);

console.log("spine-events.test.ts ok");
