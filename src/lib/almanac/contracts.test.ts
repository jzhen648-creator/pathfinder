import { describe, expect, it } from "vitest";
import {
  commitAlmanacImportRequestSchema,
  mergeAlmanacSubjectsRequestSchema,
  updateAlmanacSubjectRequestSchema,
  updateAlmanacUpdatePreferenceRequestSchema,
} from "@/lib/almanac/contracts";

describe("persisted Almanac commit contract", () => {
  const valid = {
    idempotencyKey: "client-import-001",
    rawPacket: "ALMANAC/1\nscope: chat\nStudio | NOW | Weekly sessions are active.",
    decisions: [{ lineNumber: 3, accepted: true }],
  };

  it("accepts the bounded client decision envelope", () => {
    expect(commitAlmanacImportRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects duplicate decisions for one line", () => {
    expect(
      commitAlmanacImportRequestSchema.safeParse({
        ...valid,
        decisions: [valid.decisions[0], valid.decisions[0]],
      }).success,
    ).toBe(false);
  });

  it("rejects Place or supersession identifiers on a rejected line", () => {
    expect(
      commitAlmanacImportRequestSchema.safeParse({
        ...valid,
        decisions: [{ lineNumber: 3, accepted: false, placeId: "place-other" }],
      }).success,
    ).toBe(false);
  });

  it("accepts bounded user corrections on an accepted line", () => {
    expect(
      commitAlmanacImportRequestSchema.safeParse({
        ...valid,
        decisions: [{
          lineNumber: 3,
          accepted: true,
          subjectName: "Studio practice",
          state: "NEXT",
          statement: "Book the next studio session.",
        }],
      }).success,
    ).toBe(true);
  });

  it("rejects corrections on a rejected line", () => {
    expect(
      commitAlmanacImportRequestSchema.safeParse({
        ...valid,
        decisions: [{
          lineNumber: 3,
          accepted: false,
          state: "NEXT",
        }],
      }).success,
    ).toBe(false);
  });

  it("has no client-provided userId field", () => {
    expect(commitAlmanacImportRequestSchema.safeParse({ ...valid, userId: "user-b" }).success).toBe(
      false,
    );
  });
});

describe("Subject organisation contracts", () => {
  it("accepts only bounded presentation changes", () => {
    expect(updateAlmanacSubjectRequestSchema.safeParse({
      displayName: "Financial services career",
      iconKey: "briefcase-business",
      archived: false,
    }).success).toBe(true);
    expect(updateAlmanacSubjectRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAlmanacSubjectRequestSchema.safeParse({ iconKey: "sparkles" }).success).toBe(true);
    expect(updateAlmanacSubjectRequestSchema.safeParse({ iconKey: "made-up-icon" }).success).toBe(false);
  });

  it("requires an explicit destination and combined name", () => {
    expect(mergeAlmanacSubjectsRequestSchema.safeParse({
      sourceSubjectId: "mortgage",
      targetSubjectId: "financial",
      displayName: "Financial services career",
    }).success).toBe(true);
    expect(mergeAlmanacSubjectsRequestSchema.safeParse({
      sourceSubjectId: "same",
      targetSubjectId: "same",
      displayName: "Career",
    }).success).toBe(false);
  });
});

describe("Update visibility contract", () => {
  it("accepts only an explicit hidden value", () => {
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ hidden: true }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ hidden: false }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ hidden: true, userId: "other" }).success).toBe(false);
  });
});
