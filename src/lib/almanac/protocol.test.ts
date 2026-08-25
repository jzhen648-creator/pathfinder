import { describe, expect, it } from "vitest";
import {
  almanacUpdateFingerprint,
  normaliseAlmanacPlaceName,
  parseAlmanacPacket,
} from "@/lib/almanac/protocol";

describe("ALMANAC/1 persisted parser", () => {
  it.each([
    ["chat", 5],
    ["project", 10],
    ["bootstrap", 12],
  ] as const)("accepts a valid %s packet at its limit", (scope, limit) => {
    const lines = Array.from(
      { length: limit },
      (_, index) => `Place ${index + 1} | NOW | Statement ${index + 1}.`,
    );
    const parsed = parseAlmanacPacket(`ALMANAC/1\nscope: ${scope}\n${lines.join("\n")}`);
    expect(parsed.fatalErrors).toEqual([]);
    expect(parsed.invalidLines).toEqual([]);
    expect(parsed.updates).toHaveLength(limit);
  });

  it("rejects an invalid header", () => {
    expect(parseAlmanacPacket("ALMANAC/2\nscope: chat").fatalErrors[0]?.code).toBe(
      "invalid_header",
    );
  });

  it("rejects an invalid scope", () => {
    expect(parseAlmanacPacket("ALMANAC/1\nscope: account").fatalErrors[0]?.code).toBe(
      "invalid_scope",
    );
  });

  it("rejects an invalid state", () => {
    expect(
      parseAlmanacPacket("ALMANAC/1\nscope: chat\nStudio | MAYBE | Try it.").invalidLines[0]
        ?.code,
    ).toBe("invalid_state");
  });

  it("rejects excess lines", () => {
    const body = Array.from({ length: 6 }, (_, index) => `P${index} | NOW | S${index}.`).join(
      "\n",
    );
    expect(parseAlmanacPacket(`ALMANAC/1\nscope: chat\n${body}`).fatalErrors[0]?.code).toBe(
      "excess_updates",
    );
  });

  it.each([
    [" | NOW | Present.", "missing_place"],
    ["Studio | NOW | ", "missing_statement"],
    ["Studio | NOW | Present | extra", "invalid_delimiters"],
  ] as const)("reports invalid line %s", (line, code) => {
    expect(parseAlmanacPacket(`ALMANAC/1\nscope: chat\n${line}`).invalidLines[0]?.code).toBe(
      code,
    );
  });

  it("normalises Place identity and Update fingerprints deterministically", () => {
    expect(normaliseAlmanacPlaceName("  Home   Workshop ")).toBe("home workshop");
    expect(almanacUpdateFingerprint("NOW", "  Tools   are ready. ")).toBe(
      "NOW\u001ftools are ready.",
    );
  });
});
