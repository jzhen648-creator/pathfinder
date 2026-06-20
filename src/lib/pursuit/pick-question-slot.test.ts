import { describe, expect, it } from "vitest";

import {
  filterClarifiersForQuestionSlot,
  pickQuestionSlotForPursuit,
  RETROSPECTIVE_CLARIFIER_ID_PREFIX,
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

const baseCtx = {
  signal: thinSignal,
  completedAt: null,
  significance: 3,
  enrichAnswers: [],
  quickQuestionsQuietUntil: null,
  siblingGoalIds: ["b"],
  existingRelationshipPeerIds: [],
};

describe("pickQuestionSlotForPursuit", () => {
  it("returns none for PAUSED pursuits", () => {
    expect(
      pickQuestionSlotForPursuit({ ...baseCtx, status: "PAUSED" }),
    ).toBe("none");
  });

  it("returns none when cooldown is active", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "ACTIVE",
        quickQuestionsQuietUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toBe("none");
  });

  it("returns retrospective for COMPLETE before a retro answer exists", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "COMPLETE",
        completedAt: new Date(),
      }),
    ).toBe("retrospective");
  });

  it("returns suggest_add after retrospective is answered on recently complete pursuit", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "COMPLETE",
        completedAt: new Date(),
        enrichAnswers: [
          {
            clarifierId: `${RETROSPECTIVE_CLARIFIER_ID_PREFIX}unlock`,
            prompt: "What did finishing unlock?",
            selectedOption: "More time",
          },
        ],
      }),
    ).toBe("suggest_add");
  });

  it("returns clarify for ACTIVE and MAINTAINING", () => {
    expect(pickQuestionSlotForPursuit({ ...baseCtx, status: "ACTIVE" })).toBe("clarify");
    expect(pickQuestionSlotForPursuit({ ...baseCtx, status: "MAINTAINING" })).toBe("clarify");
  });
});

describe("filterClarifiersForQuestionSlot", () => {
  it("keeps up to three forward clarifiers for clarify slot", () => {
    const filtered = filterClarifiersForQuestionSlot(
      [
        { id: "a", prompt: "Q1?", options: ["A", "B"], kind: "clarify" },
        { id: "b", prompt: "Q2?", options: ["A", "B"], kind: "clarify" },
        { id: "c", prompt: "Q3?", options: ["A", "B"], kind: "clarify" },
        { id: "d", prompt: "Q4?", options: ["A", "B"], kind: "clarify" },
      ],
      "clarify",
    );
    expect(filtered).toHaveLength(3);
    expect(filtered.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps one suggest_add only", () => {
    const filtered = filterClarifiersForQuestionSlot(
      [
        { id: "a", prompt: "Add?", options: ["Yes", "No thanks"], kind: "suggest_add", suggestedTitle: "Next" },
        { id: "b", prompt: "Other?", options: ["A", "B"], kind: "suggest_add", suggestedTitle: "Other" },
      ],
      "suggest_add",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("a");
  });

  it("returns empty for none slot", () => {
    expect(
      filterClarifiersForQuestionSlot(
        [{ id: "a", prompt: "Q?", options: ["A", "B"], kind: "clarify" }],
        "none",
      ),
    ).toEqual([]);
  });
});
