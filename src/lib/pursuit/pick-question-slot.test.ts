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

  it("returns none for COMPLETE pursuits", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "COMPLETE",
        completedAt: new Date(),
      }),
    ).toBe("none");
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "COMPLETE",
        completedAt: new Date(),
        background: "Finished because the goal was met.",
      }),
    ).toBe("none");
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

  it("returns none when note is below minimum and no answers yet", () => {
    expect(pickQuestionSlotForPursuit({ ...baseCtx, status: "ACTIVE" })).toBe("none");
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
    ).toBe("none");
  });

  it("returns clarify when note meets minimum", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "ACTIVE",
        signal: {
          ...thinSignal,
          backgroundChars: 24,
        },
      }),
    ).toBe("clarify");
  });

  it("returns clarify for ACTIVE and MAINTAINING once ladder started", () => {
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "ACTIVE",
        signal: { ...thinSignal, enrichAnswerCount: 1 },
      }),
    ).toBe("clarify");
    expect(
      pickQuestionSlotForPursuit({
        ...baseCtx,
        status: "MAINTAINING",
        signal: { ...thinSignal, enrichAnswerCount: 1 },
      }),
    ).toBe("clarify");
  });
});

describe("filterClarifiersForQuestionSlot", () => {
  it("keeps at most one forward clarifier for clarify slot", () => {
    const filtered = filterClarifiersForQuestionSlot(
      [
        { id: "a", prompt: "Q1?", options: ["A", "B"], kind: "clarify" },
        { id: "b", prompt: "Q2?", options: ["A", "B"], kind: "clarify" },
        { id: "c", prompt: "Q3?", options: ["A", "B"], kind: "clarify" },
      ],
      "clarify",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered.map((c) => c.id)).toEqual(["a"]);
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
