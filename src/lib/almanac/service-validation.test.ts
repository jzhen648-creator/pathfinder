import { describe, expect, it } from "vitest";
import {
  AlmanacValidationError,
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
});
