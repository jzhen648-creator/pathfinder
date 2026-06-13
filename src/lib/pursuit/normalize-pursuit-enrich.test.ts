import assert from "node:assert/strict";
import { pursuitEnrichBatchSchema } from "@/lib/pursuit/pursuit-enrich-types";
import {
  normalizePursuitEnrichBatch,
  normalizePursuitEnrichEntry,
} from "@/lib/pursuit/normalize-pursuit-enrich";

const pursuitId = "p1";

// Missing milestone order — assign from index
const milestonesOnly = normalizePursuitEnrichEntry({
  clarifiers: [],
  insight: null,
  suggestedMilestones: [{ title: "First step" }, { title: "Second", position: 2 }],
}) as {
  suggestedMilestones: Array<{ title: string; order: number }> | null;
};
assert.equal(milestonesOnly.suggestedMilestones?.[0].order, 0);
assert.equal(milestonesOnly.suggestedMilestones?.[1].order, 2);

// String milestone list
const stringMilestones = normalizePursuitEnrichEntry({
  clarifiers: [],
  insight: null,
  suggestedMilestones: ["Apply", "Interview"],
});
assert.deepEqual(stringMilestones?.suggestedMilestones, [
  { title: "Apply", order: 0 },
  { title: "Interview", order: 1 },
]);

// Flat insight fields at top level
const flatInsight = normalizePursuitEnrichEntry({
  tone: "reality check",
  headline: "Behind pace",
  body: "Two milestones remain.",
  clarifiers: [],
  suggestedMilestones: null,
});
assert.deepEqual(flatInsight?.insight, {
  tone: "reality_check",
  headline: "Behind pace",
  body: "Two milestones remain.",
});

// Clarifier option drift — object labels, single option padded
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
assert.equal(clarifiers.clarifiers.length, 1);
assert.deepEqual(clarifiers.clarifiers[0].options, ["Tech", "Not sure"]);
assert.ok(clarifiers.clarifiers[0].id);

// Full batch passes Zod after normalize
const batch = normalizePursuitEnrichBatch({
  pursuits: {
    [pursuitId]: {
      tone: "encouraging",
      headline: "Good momentum",
      body: "Keep going.",
      clarifiers: [],
      suggestedMilestones: [{ title: "Next step" }],
    },
  },
});
const parsed = pursuitEnrichBatchSchema.safeParse(batch);
assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));

console.log("normalize-pursuit-enrich.test.ts ok");
