import { describe, expect, it } from "vitest";
import {
  commitAlmanacImportRequestSchema,
  createDirectAlmanacSubjectUpdateRequestSchema,
  directAlmanacSubjectUpdateResponseSchema,
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
  it("accepts partial curation without requiring unrelated fields", () => {
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ hidden: true }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ hidden: false }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ significance: "KEY" }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({
      targetDate: { precision: "MONTH", year: 2027, month: 6 },
    }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ targetDate: null }).success).toBe(true);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({ hidden: true, userId: "other" }).success).toBe(false);
  });

  it("rejects invented precision and invalid calendar dates", () => {
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({
      targetDate: { precision: "YEAR", year: 2027, month: 6 },
    }).success).toBe(false);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({
      targetDate: { precision: "DAY", year: 2027, month: 2, day: 29 },
    }).success).toBe(false);
    expect(updateAlmanacUpdatePreferenceRequestSchema.safeParse({
      targetDate: { precision: "DAY", year: 2028, month: 2, day: 29 },
    }).success).toBe(true);
  });
});

describe("direct record-repair contracts", () => {
  const correction = {
    idempotencyKey: "direct-correction-001",
    action: "correction",
    state: "NOW",
    statement: "The exact wording I chose.",
    supersedesUpdateIds: ["update-old"],
  } as const;

  it("requires an explicit predecessor and preserves exact user wording", () => {
    const parsed = createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      statement: "  The exact wording I chose.  ",
      curation: { significance: "KEY" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.statement).toBe("  The exact wording I chose.  ");
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      supersedesUpdateIds: [],
    }).success).toBe(false);
  });

  it("bounds predecessor cardinality by the chosen repair action", () => {
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      supersedesUpdateIds: ["one", "two"],
    }).success).toBe(false);
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      action: "resolution",
      supersedesUpdateIds: ["one", "two"],
    }).success).toBe(true);
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      action: "resolution",
      supersedesUpdateIds: ["one", "one"],
    }).success).toBe(false);
  });

  it("allows outcomes only from OPEN to a settled state at service validation", () => {
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      action: "outcome",
      state: "DONE",
    }).success).toBe(true);
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      action: "outcome",
      state: "OPEN",
    }).success).toBe(false);
  });

  it("limits target dates to NEXT and rejects injected ownership", () => {
    const targetDate = { precision: "YEAR", year: 2028 } as const;
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      state: "NEXT",
      curation: { targetDate },
    }).success).toBe(true);
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      curation: { targetDate },
    }).success).toBe(false);
    expect(createDirectAlmanacSubjectUpdateRequestSchema.safeParse({
      ...correction,
      userId: "other",
    }).success).toBe(false);
  });

  it("defines truthful USER_ENTRY response metadata", () => {
    expect(directAlmanacSubjectUpdateResponseSchema.safeParse({
      disposition: "created",
      importId: "import-direct",
      updateId: "update-new",
      scope: "direct",
      originKind: "USER_ENTRY",
      supersedesUpdateIds: ["update-old"],
      curation: { hidden: false, significance: "STANDARD", targetDate: null },
      atlas: {},
    }).success).toBe(true);
    expect(directAlmanacSubjectUpdateResponseSchema.safeParse({
      disposition: "created",
      importId: "import-direct",
      updateId: "update-new",
      scope: "direct",
      originKind: "AI_RESPONSE",
      supersedesUpdateIds: ["update-old"],
      curation: { hidden: false, significance: "STANDARD", targetDate: null },
      atlas: {},
    }).success).toBe(false);
  });
});
