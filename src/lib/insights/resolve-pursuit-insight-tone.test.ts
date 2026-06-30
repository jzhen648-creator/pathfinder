import { describe, expect, it } from "vitest";

import { buildPursuitToneGuidanceBlock } from "@/lib/insights/pursuit-tone-prompt";
import { resolvePursuitInsightTone, type PursuitToneGoalInput } from "@/lib/insights/resolve-pursuit-insight-tone";

function goal(overrides: Partial<PursuitToneGoalInput> = {}): PursuitToneGoalInput {
  return {
    title: "CeMAP qualification",
    background: null,
    enrichAnswers: [],
    status: "ACTIVE",
    significance: 4,
    deadline: new Date("2026-07-01T00:00:00.000Z"),
    targetAmount: null,
    currentAmount: null,
    milestones: [],
    ...overrides,
  };
}

describe("resolvePursuitInsightTone", () => {
  const now = new Date("2026-06-21T12:00:00.000Z").getTime();

  it("returns arrival for COMPLETE", () => {
    expect(resolvePursuitInsightTone(goal({ status: "COMPLETE" }), now)).toBe("arrival");
  });

  it("returns paused for PAUSED", () => {
    expect(resolvePursuitInsightTone(goal({ status: "PAUSED" }), now)).toBe("paused");
  });

  it("returns worth_a_look for gap signal", () => {
    expect(resolvePursuitInsightTone(goal(), now)).toBe("worth_a_look");
  });

  it("returns context when thin", () => {
    expect(
      resolvePursuitInsightTone(
        goal({ significance: 2, deadline: null, title: "X" }),
        now,
      ),
    ).toBe("context");
  });

  it("returns in_focus with enough context and no gap", () => {
    expect(
      resolvePursuitInsightTone(
        goal({
          significance: 3,
          deadline: new Date("2027-01-01T00:00:00.000Z"),
          background: "x".repeat(90),
          milestones: [{ title: "Step one", completedAt: new Date("2026-06-01T00:00:00.000Z") }],
        }),
        now,
      ),
    ).toBe("in_focus");
  });
});

describe("buildPursuitToneGuidanceBlock", () => {
  it("includes tone voice lines per pursuit id", () => {
    const toneGoals = new Map([
      ["p-gap", goal()],
      ["p-done", goal({ status: "COMPLETE" })],
    ]);
    const block = buildPursuitToneGuidanceBlock(["p-gap", "p-done"], toneGoals)!;
    expect(block).toContain("<pursuit_tone_guidance>");
    expect(block).toContain("p-gap:");
    expect(block).toContain("Tone: worth_a_look");
    expect(block).toContain("p-done:");
    expect(block).toContain("Tone: arrival");
  });
});
