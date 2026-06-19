import { describe, expect, it } from "vitest";

import {
  filterClarifiersForQuestionSlot,
  pickQuestionSlotForPursuit,
} from "@/lib/pursuit/pick-question-slot";
import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";

const thinSignal: PursuitSignal = {
  title: "Project",
  description: "Short",
  enrichAnswerCount: 0,
  milestoneCount: 0,
  completedMilestoneCount: 0,
  hasDeadline: false,
  hasQuantifiedTarget: false,
  status: "ACTIVE",
};

describe("pickQuestionSlotForPursuit", () => {
  it("prefers suggest_add when recently complete", () => {
    const slot = pickQuestionSlotForPursuit({
      signal: thinSignal,
      status: "COMPLETE",
      completedAt: new Date(),
      siblingGoalIds: ["b"],
      existingRelationshipPeerIds: [],
    });
    expect(slot).toBe("suggest_add");
  });

  it("falls back to clarify when context is thin", () => {
    const slot = pickQuestionSlotForPursuit({
      signal: thinSignal,
      status: "ACTIVE",
      completedAt: null,
      siblingGoalIds: ["peer-1"],
      existingRelationshipPeerIds: [],
    });
    expect(slot).toBe("clarify");
  });
});

describe("filterClarifiersForQuestionSlot", () => {
  it("keeps matching kind only", () => {
    const filtered = filterClarifiersForQuestionSlot(
      [
        { id: "a", prompt: "Q?", options: ["Yes", "No"], kind: "suggest_add" },
        { id: "b", prompt: "Other?", options: ["A", "B"], kind: "clarify" },
      ],
      "suggest_add",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("a");
  });
});
