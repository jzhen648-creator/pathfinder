import { describe, expect, it } from "vitest";

import {
  filterClarifiersForQuestionSlot,
  pickQuestionSlotForPursuit,
  RETROSPECTIVE_CLARIFIER_ID_PREFIX,
} from "@/lib/pursuit/pick-question-slot";
import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";
import type { Clarifier } from "@/lib/pursuit/pursuit-enrich-types";

const thinSignal: PursuitSignal = {
  title: "Project",
  backgroundChars: 0,
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

  it("returns none for COMPLETE when user freeform is set", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "COMPLETE",
        completedAt: new Date(),
        background: "Finished because the goal was met.",
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

  it("returns none after retrospective is answered on recently complete pursuit", () => {
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
    ).toBe("none");
  });

  it("returns clarify for ACTIVE and MAINTAINING", () => {
    expect(pickQuestionSlotForPursuit({ ...baseCtx, status: "ACTIVE" })).toBe("clarify");
    expect(pickQuestionSlotForPursuit({ ...baseCtx, status: "MAINTAINING" })).toBe("clarify");
  });

  it("returns clarify for deadline+title pursuit with no enrich answers", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "ACTIVE",
        signal: {
          title: "Save for house deposit",
          backgroundChars: 0,
          enrichAnswerCount: 0,
          milestoneCount: 0,
          completedMilestoneCount: 0,
          hasDeadline: true,
          hasQuantifiedTarget: false,
          status: "ACTIVE",
        },
      }),
    ).toBe("clarify");
  });
});

describe("filterClarifiersForQuestionSlot", () => {
  it("keeps up to six forward clarifiers for clarify slot", () => {
    const filtered = filterClarifiersForQuestionSlot(
      [
        { id: "a", prompt: "Q1?", options: ["A", "B"], kind: "clarify" },
        { id: "b", prompt: "Q2?", options: ["A", "B"], kind: "clarify" },
        { id: "c", prompt: "Q3?", options: ["A", "B"], kind: "clarify" },
        { id: "d", prompt: "Q4?", options: ["A", "B"], kind: "clarify" },
        { id: "e", prompt: "Q5?", options: ["A", "B"], kind: "clarify" },
        { id: "f", prompt: "Q6?", options: ["A", "B"], kind: "clarify" },
        { id: "g", prompt: "Q7?", options: ["A", "B"], kind: "clarify" },
      ],
      "clarify",
    );
    expect(filtered).toHaveLength(6);
    expect(filtered.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("drops retired suggest_add clarifiers from clarify slot", () => {
    const filtered = filterClarifiersForQuestionSlot(
      [
        { id: "a", prompt: "Add?", options: ["Yes", "No thanks"], kind: "suggest_add" } as unknown as Clarifier,
        { id: "b", prompt: "Q?", options: ["A", "B"], kind: "clarify" },
      ],
      "clarify",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("b");
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
