import { describe, expect, it } from "vitest";
import { reflectPursuitEntrySchema } from "@/lib/ai/reflect-types";

describe("reflectPursuitEntrySchema suggestedContinuations", () => {
  it("accepts up to two continuation suggestions", () => {
    const parsed = reflectPursuitEntrySchema.safeParse({
      headline: "Qualification complete",
      body: "CeMAP is finished.",
      suggestedContinuations: [
        { title: "Mortgage advisory practice", rationale: "Natural next step." },
        { title: "Broker network", rationale: "Build client flow." },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts omitted continuations", () => {
    const parsed = reflectPursuitEntrySchema.safeParse({
      headline: "Still active",
      body: "Work continues.",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.suggestedContinuations).toBeUndefined();
    }
  });
});
