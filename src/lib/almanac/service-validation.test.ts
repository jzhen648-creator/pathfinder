import { describe, expect, it } from "vitest";
import {
  AlmanacValidationError,
  canSupersedeAlmanacUpdateState,
  createDirectAlmanacSubjectUpdate,
  validateAlmanacCommitRequest,
} from "@/lib/almanac/service";

describe("server-side Almanac decision validation", () => {
  const rawPacket = [
    "ALMANAC/1",
    "scope: chat",
    "Studio | NOW | Weekly sessions are active.",
    "Community garden | NEXT | Confirm the volunteer rota.",
  ].join("\n");

  it("accepts exactly one decision for every valid packet line", () => {
    const result = validateAlmanacCommitRequest({
      idempotencyKey: "client-import-001",
      rawPacket,
      decisions: [
        { lineNumber: 3, accepted: true },
        { lineNumber: 4, accepted: false },
      ],
    });
    expect(result.packetScope).toBe("chat");
    expect([...result.decisionByLine]).toHaveLength(2);
  });

  it("rejects a client decision for a line absent from the raw packet", () => {
    expect(() =>
      validateAlmanacCommitRequest({
        idempotencyKey: "client-import-001",
        rawPacket,
        decisions: [
          { lineNumber: 3, accepted: true },
          { lineNumber: 5, accepted: true },
        ],
      }),
    ).toThrow(AlmanacValidationError);
  });

  it("allows the client to omit lines it classified as existing duplicates", () => {
    const result = validateAlmanacCommitRequest({
      idempotencyKey: "client-import-001",
      rawPacket,
      decisions: [{ lineNumber: 3, accepted: true }],
    });
    expect([...result.decisionByLine.keys()]).toEqual([3]);
  });

  it("does not require a decision for an exact duplicate packet line", () => {
    const duplicatePacket = `${rawPacket}\nStudio | NOW | Weekly sessions are active.`;
    const result = validateAlmanacCommitRequest({
      idempotencyKey: "client-import-002",
      rawPacket: duplicatePacket,
      decisions: [
        { lineNumber: 3, accepted: true },
        { lineNumber: 4, accepted: true },
      ],
    });
    expect([...result.duplicateLines]).toEqual([5]);
  });

  it("accepts snapshot-assisted metadata while preserving exact source line decisions", () => {
    const comparedPacket = [
      "ALMANAC/1",
      "scope: chat",
      "coverage: searched",
      "result: changes",
      "Studio | NOW | Weekly sessions are active.",
    ].join("\n");
    const result = validateAlmanacCommitRequest({
      idempotencyKey: "client-import-003",
      rawPacket: comparedPacket,
      decisions: [{ lineNumber: 5, accepted: true }],
    });
    expect([...result.decisionByLine.keys()]).toEqual([5]);
  });
});

describe("explicit Almanac supersession states", () => {
  const expectedEarlierStates = {
    NOW: ["NOW", "NEXT", "OPEN"],
    NEXT: ["NEXT", "OPEN"],
    OPEN: ["OPEN"],
    DONE: ["NOW", "NEXT", "OPEN", "DONE"],
  } as const;
  const states = ["NOW", "NEXT", "OPEN", "DONE"] as const;

  it.each(states)("allows only the agreed earlier states for incoming %s", (incomingState) => {
    expect(
      states.filter((earlierState) =>
        canSupersedeAlmanacUpdateState(incomingState, earlierState),
      ),
    ).toEqual(expectedEarlierStates[incomingState]);
  });
});

describe("direct record-repair defensive validation", () => {
  const correction = {
    idempotencyKey: "direct-validation-001",
    action: "correction" as const,
    state: "NOW" as const,
    statement: "Corrected wording.",
    supersedesUpdateIds: ["update-a"],
  };

  it("rejects CR/LF before opening a database transaction", async () => {
    await expect(
      createDirectAlmanacSubjectUpdate("user-a", "subject-a", {
        ...correction,
        statement: "line one\r\nline two",
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
  });

  it("rejects duplicate predecessor IDs before opening a database transaction", async () => {
    await expect(
      createDirectAlmanacSubjectUpdate("user-a", "subject-a", {
        ...correction,
        action: "resolution",
        supersedesUpdateIds: ["update-a", "update-a"],
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
  });

  it("rejects a target date on a non-NEXT Update before opening a database transaction", async () => {
    await expect(
      createDirectAlmanacSubjectUpdate("user-a", "subject-a", {
        ...correction,
        curation: {
          targetDate: {
            precision: "YEAR",
            year: 2028,
            month: null,
            day: null,
          },
        },
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
  });
});
