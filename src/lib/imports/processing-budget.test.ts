import { describe, expect, it } from "vitest";
import {
  MAX_PROCESSING_RUNS_PER_WINDOW,
  MAX_SEGMENTS_PER_SOURCE,
  MAX_SEGMENTS_PER_WINDOW,
  MAX_IMPORT_SOURCE_CHARACTERS,
  planProcessingBudget,
  PROCESSING_WINDOW_HOURS,
} from "@/lib/imports/processing-budget";
import { DEFAULT_IMPORT_SEGMENT_CHARACTERS } from "@/lib/imports/segmentation";

const fresh = { runsInWindow: 0, segmentsInWindow: 0 };

describe("planProcessingBudget", () => {
  it("allows an ordinary import", () => {
    expect(planProcessingBudget({ segmentCount: 6, usage: fresh })).toEqual({ allowed: true });
  });

  it("rejects a source larger than one run may process, and says to split it", () => {
    const decision = planProcessingBudget({
      segmentCount: MAX_SEGMENTS_PER_SOURCE + 1,
      usage: fresh,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SOURCE_TOO_LARGE");
    // Splitting is the user's move, so there is nothing to wait for.
    expect(decision.retryAfterHours).toBeNull();
    expect(decision.message).toMatch(/split/i);
  });

  it("accepts a source exactly at the per-source limit", () => {
    expect(
      planProcessingBudget({ segmentCount: MAX_SEGMENTS_PER_SOURCE, usage: fresh }),
    ).toEqual({ allowed: true });
  });

  it("stops a user who has started too many runs in the window", () => {
    const decision = planProcessingBudget({
      segmentCount: 1,
      usage: { runsInWindow: MAX_PROCESSING_RUNS_PER_WINDOW, segmentsInWindow: 0 },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("TOO_MANY_RUNS");
    expect(decision.retryAfterHours).toBe(PROCESSING_WINDOW_HOURS);
  });

  it("stops a request that would cross the segment budget, not merely one that has", () => {
    const decision = planProcessingBudget({
      segmentCount: 5,
      usage: { runsInWindow: 1, segmentsInWindow: MAX_SEGMENTS_PER_WINDOW - 4 },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SEGMENT_BUDGET_EXHAUSTED");
  });

  it("allows a request that exactly fills the segment budget", () => {
    expect(
      planProcessingBudget({
        segmentCount: 4,
        usage: { runsInWindow: 1, segmentsInWindow: MAX_SEGMENTS_PER_WINDOW - 4 },
      }),
    ).toEqual({ allowed: true });
  });

  it("reports size before rate, so an oversized source is not blamed on usage", () => {
    const decision = planProcessingBudget({
      segmentCount: MAX_SEGMENTS_PER_SOURCE + 10,
      usage: { runsInWindow: MAX_PROCESSING_RUNS_PER_WINDOW, segmentsInWindow: 999 },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SOURCE_TOO_LARGE");
  });

  it("never tells the user how the limits are composed", () => {
    const decisions = [
      planProcessingBudget({ segmentCount: 999, usage: fresh }),
      planProcessingBudget({
        segmentCount: 1,
        usage: { runsInWindow: MAX_PROCESSING_RUNS_PER_WINDOW, segmentsInWindow: 0 },
      }),
    ];
    for (const decision of decisions) {
      if (decision.allowed) continue;
      expect(decision.message).not.toMatch(/segment|token|model|quota|budget/i);
    }
  });
});

describe("limits are internally consistent", () => {
  it("keeps the per-source cap reachable from the character cap", () => {
    expect(MAX_SEGMENTS_PER_SOURCE).toBe(
      Math.ceil(MAX_IMPORT_SOURCE_CHARACTERS / DEFAULT_IMPORT_SEGMENT_CHARACTERS),
    );
  });

  it("lets the window hold several full-sized sources", () => {
    expect(MAX_SEGMENTS_PER_WINDOW).toBeGreaterThan(MAX_SEGMENTS_PER_SOURCE * 2);
  });

  it("bounds a single paste well below the previous half-million-character ceiling", () => {
    expect(MAX_IMPORT_SOURCE_CHARACTERS).toBeLessThan(500_000);
  });
});
