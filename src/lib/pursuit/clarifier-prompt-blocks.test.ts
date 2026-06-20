import { describe, expect, it } from "vitest";

import {
  CLARIFIER_BATCH_MAX,
  CLARIFIER_GENERATION_PRINCIPLE,
  CLARIFIER_MILESTONE_GROUNDING,
  CONTEXTUAL_QUICK_QUESTIONS,
  CREATE_CLARIFIER_MILESTONE_GROUNDING,
  buildCreateClarifierSystemPrompt,
} from "@/lib/pursuit/clarifier-prompt-blocks";

describe("clarifier prompt blocks", () => {
  it("includes milestone grounding and principle-based generation", () => {
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain(CLARIFIER_MILESTONE_GROUNDING);
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain(CLARIFIER_GENERATION_PRINCIPLE);
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("completed: true");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain(`up to ${CLARIFIER_BATCH_MAX}`);
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("empty array when no high-value gap remains");
  });

  it("does not include the old domain catalog vignettes", () => {
    expect(CONTEXTUAL_QUICK_QUESTIONS).not.toContain("CeMAP qualification");
    expect(CONTEXTUAL_QUICK_QUESTIONS).not.toContain("Plan wedding");
    expect(CONTEXTUAL_QUICK_QUESTIONS).not.toContain("£500,000 ISA");
    expect(CONTEXTUAL_QUICK_QUESTIONS).not.toContain("Ask ONE question per sync");
  });

  it("keeps milestone counter-example as illustration of the move", () => {
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("jump to 10k");
    expect(CONTEXTUAL_QUICK_QUESTIONS).toContain("Rental");
  });

  it("shares principle with create-time prompt", () => {
    const createPrompt = buildCreateClarifierSystemPrompt();
    expect(createPrompt).toContain(CLARIFIER_GENERATION_PRINCIPLE);
    expect(createPrompt).not.toContain("credit cards, mortgages, races");
    expect(CREATE_CLARIFIER_MILESTONE_GROUNDING).toContain("next frontier");
  });
});
