import { describe, expect, it } from "vitest";

import {
  CLARIFIER_MILESTONE_GROUNDING,
  CONTEXTUAL_QUICK_QUESTIONS,
  CREATE_CLARIFIER_MILESTONE_GROUNDING,
} from "@/lib/pursuit/clarifier-prompt-blocks";

describe("clarifier prompt blocks", () => {
  it("includes milestone grounding rules in contextual quick questions", () => {
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain(CLARIFIER_MILESTONE_GROUNDING);
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("completed: true");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("currentAmount");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("Never offer an answer option that contradicts");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("next frontier");
    expect(CONTEXTUAL_QUICK_QUESTIONS).not.toContain(
      '"Under 5k" / "5-10k" / "10k+" / "Haven\'t started training"',
    );
  });

  it("shows half-marathon counter-example when 5k is already complete", () => {
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("5k without stopping");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("Wrong:");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("Right:");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("jump to 10k");
  });

  it("includes create-time milestone grounding", () => {
    expect(CREATE_CLARIFIER_MILESTONE_GROUNDING).toContain("next frontier");
    expect(CREATE_CLARIFIER_MILESTONE_GROUNDING).toContain("Under 5k");
  });
});
