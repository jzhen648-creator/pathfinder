import { describe, expect, it } from "vitest";
import {
  MAX_PROCESSING_RUNS_PER_WINDOW,
  MAX_SEGMENTS_PER_WINDOW,
  planProcessingBudget,
  PROCESSING_WINDOW_HOURS,
} from "@/lib/imports/processing-budget";
import { DEFAULT_IMPORT_SEGMENTS_PER_RUN } from "@/lib/imports/process-source";
import { MAX_IMPORT_SOURCE_CHARACTERS } from "@/lib/imports/ingest-source";
import { DEFAULT_IMPORT_SEGMENT_CHARACTERS } from "@/lib/imports/segmentation";

const fresh = { runsInWindow: 0, segmentsInWindow: 0 };

describe("planProcessingBudget", () => {
  it("allows an ordinary run", () => {
    expect(planProcessingBudget({ segmentCount: 6, usage: fresh })).toEqual({ allowed: true });
  });

  it("never rejects for source size — a long source is paced, not refused", () => {
    // A run only ever charges for what it will process, never the whole source.
    expect(
      planProcessingBudget({ segmentCount: DEFAULT_IMPORT_SEGMENTS_PER_RUN, usage: fresh }),
    ).toEqual({ allowed: true });
  });

  it("lets the largest storable source be finished within one window", () => {
    // Otherwise a person could paste something they were never able to complete.
    const segments = Math.ceil(MAX_IMPORT_SOURCE_CHARACTERS / DEFAULT_IMPORT_SEGMENT_CHARACTERS);
    const runs = Math.ceil(segments / DEFAULT_IMPORT_SEGMENTS_PER_RUN);
    expect(segments).toBeLessThanOrEqual(MAX_SEGMENTS_PER_WINDOW);
    expect(runs).toBeLessThanOrEqual(MAX_PROCESSING_RUNS_PER_WINDOW);
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

  it("stops a run that would cross the segment budget, not merely one that has", () => {
    const decision = planProcessingBudget({
      segmentCount: 5,
      usage: { runsInWindow: 1, segmentsInWindow: MAX_SEGMENTS_PER_WINDOW - 4 },
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SEGMENT_BUDGET_EXHAUSTED");
  });

  it("allows a run that exactly fills the segment budget", () => {
    expect(
      planProcessingBudget({
        segmentCount: 4,
        usage: { runsInWindow: 1, segmentsInWindow: MAX_SEGMENTS_PER_WINDOW - 4 },
      }),
    ).toEqual({ allowed: true });
  });

  it("tells the person their source is safe and when to return", () => {
    const decision = planProcessingBudget({
      segmentCount: 1,
      usage: { runsInWindow: MAX_PROCESSING_RUNS_PER_WINDOW, segmentsInWindow: 0 },
    });
    if (decision.allowed) throw new Error("expected refusal");
    expect(decision.message).toMatch(/saved/i);
    expect(decision.message).toMatch(/tomorrow/i);
  });

  it("never tells the user how the limits are composed", () => {
    const decision = planProcessingBudget({
      segmentCount: 1,
      usage: { runsInWindow: MAX_PROCESSING_RUNS_PER_WINDOW, segmentsInWindow: 0 },
    });
    if (decision.allowed) throw new Error("expected refusal");
    expect(decision.message).not.toMatch(/segment|token|model|quota|budget|limit/i);
  });
});

describe("limits are internally consistent", () => {
  it("lets a day hold several full runs", () => {
    expect(MAX_SEGMENTS_PER_WINDOW).toBeGreaterThan(DEFAULT_IMPORT_SEGMENTS_PER_RUN * 5);
  });

  it("keeps the run budget reachable before the segment budget for small sources", () => {
    // A one-segment source could be processed many times before segments bite,
    // so the run count is the control that catches repeated small requests.
    expect(MAX_PROCESSING_RUNS_PER_WINDOW).toBeLessThan(MAX_SEGMENTS_PER_WINDOW);
  });
});
