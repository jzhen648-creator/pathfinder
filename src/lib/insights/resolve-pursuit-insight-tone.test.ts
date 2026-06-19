import { describe, expect, it } from "vitest";

import { DENSE_FIXTURE_NOW } from "@/lib/map/__fixtures__/dense-map";
import {
  normalizeLegacyPursuitTone,
  resolvePursuitInsightTone,
  type PursuitToneGoalInput,
} from "@/lib/insights/resolve-pursuit-insight-tone";

function goal(overrides: Partial<PursuitToneGoalInput> = {}): PursuitToneGoalInput {
  return {
    title: "CeMAP qualification",
    description: "",
    enrichAnswers: null,
    status: "ACTIVE",
    significance: 5,
    deadline: new Date("2026-06-20T00:00:00.000Z"),
    targetAmount: null,
    currentAmount: null,
    milestones: [
      { id: "m1", title: "Unit 1", completedAt: null },
      { id: "m2", title: "Unit 2", completedAt: null },
    ],
    ...overrides,
  };
}

describe("resolvePursuitInsightTone", () => {
  it("assigns arrival for COMPLETE regardless of deadline proximity", () => {
    expect(
      resolvePursuitInsightTone(
        goal({
          status: "COMPLETE",
          completedAt: new Date("2020-01-01T00:00:00.000Z"),
          deadline: new Date("2026-06-20T00:00:00.000Z"),
        }),
        DENSE_FIXTURE_NOW,
      ),
    ).toBe("arrival");
  });

  it("assigns worth_a_look for gap signal (CeMAP-shaped fixture)", () => {
    expect(resolvePursuitInsightTone(goal(), DENSE_FIXTURE_NOW)).toBe("worth_a_look");
  });

  it("does not assign worth_a_look when amount progress suppresses gap", () => {
    const tone = resolvePursuitInsightTone(
      goal({
        title: "Clear £10,000 credit card debt",
        targetAmount: 10000,
        currentAmount: 4200,
        milestones: [],
        deadline: new Date("2026-07-01T00:00:00.000Z"),
      }),
      DENSE_FIXTURE_NOW,
    );
    expect(tone).not.toBe("worth_a_look");
    expect(tone).toBe("in_focus");
  });

  it("assigns context when below hasMinimumContextSignal", () => {
    expect(
      resolvePursuitInsightTone(
        goal({
          title: "Run",
          deadline: null,
          description: "",
          milestones: [],
        }),
        DENSE_FIXTURE_NOW,
      ),
    ).toBe("context");
  });

  it("assigns in_focus for active pursuit with context and no gap", () => {
    expect(
      resolvePursuitInsightTone(
        goal({
          title: "Product Lead search",
          deadline: new Date("2026-06-25T00:00:00.000Z"),
          milestones: [
            {
              id: "m3",
              title: "First interview",
              completedAt: new Date("2026-05-01T00:00:00.000Z"),
            },
          ],
        }),
        DENSE_FIXTURE_NOW,
      ),
    ).toBe("in_focus");
  });

  it("COMPLETE beats gap in precedence", () => {
    expect(
      resolvePursuitInsightTone(
        goal({
          status: "COMPLETE",
          milestones: [
            { id: "m1", title: "Unit 1", completedAt: null },
            { id: "m2", title: "Unit 2", completedAt: null },
          ],
        }),
        DENSE_FIXTURE_NOW,
      ),
    ).toBe("arrival");
  });
});

describe("normalizeLegacyPursuitTone", () => {
  it("maps legacy model tones to contract values", () => {
    expect(normalizeLegacyPursuitTone("celebratory")).toBe("arrival");
    expect(normalizeLegacyPursuitTone("nudge")).toBe("worth_a_look");
    expect(normalizeLegacyPursuitTone("encouraging")).toBe("in_focus");
    expect(normalizeLegacyPursuitTone("informational")).toBe("context");
    expect(normalizeLegacyPursuitTone("reality_check")).toBe("context");
  });

  it("passes through contract values", () => {
    expect(normalizeLegacyPursuitTone("worth_a_look")).toBe("worth_a_look");
    expect(normalizeLegacyPursuitTone("in_focus")).toBe("in_focus");
  });
});
