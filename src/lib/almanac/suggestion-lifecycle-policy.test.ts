import { describe, expect, it } from "vitest";

import {
  activeActionUndoBlockers,
  activeWholeSourceUndoBlockers,
  isAlmanacUpdateActive,
  nextSuggestionApplicationSequence,
  resolveSuggestionOperation,
} from "@/lib/almanac/suggestion-lifecycle-policy";

describe("persistent suggestion lifecycle policy", () => {
  it("replays an uncertain-response retry before checking its stale version", () => {
    const storedResult = { applicationId: "application-1", version: 2 };

    expect(resolveSuggestionOperation({
      storedOperation: { requestHash: "same-request", result: storedResult },
      requestHash: "same-request",
      expectedVersion: 1,
      currentVersion: 2,
    })).toEqual({ disposition: "replay", result: storedResult });
  });

  it("rejects operation-key reuse with different input", () => {
    expect(resolveSuggestionOperation({
      storedOperation: { requestHash: "first-request", result: { version: 2 } },
      requestHash: "different-request",
      expectedVersion: 1,
      currentVersion: 2,
    })).toEqual({ disposition: "operation_key_conflict" });
  });

  it("makes the second serialised concurrent request stale", () => {
    expect(resolveSuggestionOperation({
      storedOperation: null,
      requestHash: "request-a",
      expectedVersion: 1,
      currentVersion: 1,
    })).toEqual({ disposition: "apply" });

    expect(resolveSuggestionOperation({
      storedOperation: null,
      requestHash: "request-b",
      expectedVersion: 1,
      currentVersion: 2,
    })).toEqual({ disposition: "stale_version", currentVersion: 2 });
  });

  it("never reuses an acceptance sequence after Undo and edit", () => {
    expect(nextSuggestionApplicationSequence([])).toBe(1);
    expect(nextSuggestionApplicationSequence([
      { sequence: 1, reverted: true },
    ])).toBe(2);
    expect(nextSuggestionApplicationSequence([
      { sequence: 1, reverted: true },
      { sequence: 2, reverted: false },
    ])).toBe(3);
  });

  it("keeps legacy and sibling Updates active while excluding reverted applications", () => {
    expect(isAlmanacUpdateActive({ importUndone: false, applicationReverted: null })).toBe(true);
    expect(isAlmanacUpdateActive({ importUndone: false, applicationReverted: false })).toBe(true);
    expect(isAlmanacUpdateActive({ importUndone: false, applicationReverted: true })).toBe(false);
    expect(isAlmanacUpdateActive({ importUndone: true, applicationReverted: false })).toBe(false);
  });

  it("blocks action Undo on every active successor", () => {
    expect(activeActionUndoBlockers([
      { successorUpdateId: "sibling", successorImportId: "source", successorActive: true },
      { successorUpdateId: "external", successorImportId: "later", successorActive: true },
      { successorUpdateId: "historical", successorImportId: "later", successorActive: false },
    ])).toEqual(["sibling", "external"]);
  });

  it("allows atomic sibling Undo but blocks active external dependencies", () => {
    expect(activeWholeSourceUndoBlockers("source", [
      { successorUpdateId: "sibling", successorImportId: "source", successorActive: true },
      { successorUpdateId: "external", successorImportId: "later", successorActive: true },
      { successorUpdateId: "historical", successorImportId: "later", successorActive: false },
    ])).toEqual(["external"]);
  });
});
