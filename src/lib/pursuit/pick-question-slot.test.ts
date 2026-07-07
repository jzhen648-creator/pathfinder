import { describe, expect, it } from "vitest";

import {
  computeQuickQuestionsQuietUntil,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  pickQuestionSlotForPursuit,
  questionSlotUserMessageLines,
  type QuestionSlotContext,
} from "@/lib/pursuit/pick-question-slot";
import { SIGNIFICANCE_MAX } from "@/lib/pursuit/significance";

const thinSignal: PursuitSignal = {
  title: "Watch Netflix",
  backgroundChars: 0,
  enrichAnswerCount: 0,
  milestoneCount: 0,
  completedMilestoneCount: 0,
  hasDeadline: false,
  hasQuantifiedTarget: false,
  status: "ACTIVE",
};

function baseContext(overrides: Partial<QuestionSlotContext> = {}): QuestionSlotContext {
  return {
    signal: thinSignal,
    status: "ACTIVE",
    completedAt: null,
    significance: null,
    enrichAnswers: [],
    siblingGoalIds: [],
    existingRelationshipPeerIds: [],
    ...overrides,
  };
}

describe("pickQuestionSlotForPursuit", () => {
  it("returns clarify for Pivotal ACTIVE chapter with no note", () => {
    expect(
      pickQuestionSlotForPursuit(
        baseContext({
          significance: SIGNIFICANCE_MAX,
        }),
      ),
    ).toBe("clarify");
  });

  it("returns none for Meaningful ACTIVE chapter with no note", () => {
    expect(
      pickQuestionSlotForPursuit(
        baseContext({
          significance: 2,
        }),
      ),
    ).toBe("none");
  });

  it("returns none for unset significance ACTIVE chapter with no note", () => {
    expect(pickQuestionSlotForPursuit(baseContext({ significance: null }))).toBe("none");
  });

  it("returns retrospective for Pivotal COMPLETE chapter", () => {
    expect(
      pickQuestionSlotForPursuit(
        baseContext({
          status: "COMPLETE",
          significance: SIGNIFICANCE_MAX,
          completedAt: new Date("2026-07-01"),
        }),
      ),
    ).toBe("retrospective");
  });

  it("returns none for non-Pivotal COMPLETE chapter", () => {
    expect(
      pickQuestionSlotForPursuit(
        baseContext({
          status: "COMPLETE",
          significance: 2,
          completedAt: new Date("2026-07-01"),
        }),
      ),
    ).toBe("none");
  });

  it("returns none for Pivotal COMPLETE chapter during cooldown", () => {
    expect(
      pickQuestionSlotForPursuit(
        baseContext({
          status: "COMPLETE",
          significance: SIGNIFICANCE_MAX,
          quickQuestionsQuietUntil: computeQuickQuestionsQuietUntil(),
        }),
      ),
    ).toBe("none");
  });

  it("returns none for Pivotal PAUSED chapter", () => {
    expect(
      pickQuestionSlotForPursuit(
        baseContext({
          status: "PAUSED",
          significance: SIGNIFICANCE_MAX,
        }),
      ),
    ).toBe("none");
  });
});

describe("questionSlotUserMessageLines", () => {
  it("adds why-now line for note-less Pivotal clarify slot", () => {
    const lines = questionSlotUserMessageLines(
      "clarify",
      baseContext({
        significance: SIGNIFICANCE_MAX,
      }),
    );
    expect(lines.some((line) => line.includes("marked this chapter Pivotal"))).toBe(true);
  });
});
