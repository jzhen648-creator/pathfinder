import { describe, expect, it } from "vitest";
import {
  almanacUpdateFingerprint,
  normaliseAlmanacPlaceName,
  parseAlmanacPacket,
} from "@/lib/almanac/protocol";

describe("ALMANAC/1 persisted parser", () => {
  it("accepts snapshot-assisted result metadata without counting it as an Update", () => {
    const parsed = parseAlmanacPacket(
      "ALMANAC/1\nscope: chat\ncoverage: searched\nresult: changes\nStudio | NOW | Tools are ready.",
    );
    expect(parsed.result).toBe("changes");
    expect(parsed.updates[0]?.lineNumber).toBe(5);
    expect(parsed.fatalErrors).toEqual([]);
  });

  it("accepts explicit no_changes and needs_source outcomes", () => {
    expect(
      parseAlmanacPacket("ALMANAC/1\nscope: chat\ncoverage: searched\nresult: no_changes")
        .fatalErrors,
    ).toEqual([]);
    expect(
      parseAlmanacPacket("ALMANAC/1\nscope: chat\ncoverage: unavailable\nresult: needs_source")
        .fatalErrors,
    ).toEqual([]);
  });

  it("rejects inconsistent result metadata", () => {
    expect(
      parseAlmanacPacket("ALMANAC/1\nscope: chat\ncoverage: searched\nresult: changes")
        .fatalErrors[0]?.code,
    ).toBe("result_updates_mismatch");
    expect(
      parseAlmanacPacket("ALMANAC/1\nscope: chat\ncoverage: searched\nresult: needs_source")
        .fatalErrors[0]?.code,
    ).toBe("needs_source_coverage_mismatch");
  });

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

  it("accepts honest history coverage without counting it as an Update", () => {
    const parsed = parseAlmanacPacket(
      "ALMANAC/1\nscope: chat\ncoverage: partial\nStudio | NOW | Tools are ready.",
    );
    expect(parsed.coverage).toBe("partial");
    expect(parsed.updateLineCount).toBe(1);
    expect(parsed.updates[0]?.lineNumber).toBe(4);
    expect(parsed.fatalErrors).toEqual([]);
  });

  it("rejects Updates when the provider reports unavailable history", () => {
    const parsed = parseAlmanacPacket(
      "ALMANAC/1\nscope: chat\ncoverage: unavailable\nStudio | NOW | Tools are ready.",
    );
    expect(parsed.fatalErrors[0]?.code).toBe("unavailable_coverage_with_updates");
  });

  it("keeps older packets without coverage compatible", () => {
    const parsed = parseAlmanacPacket("ALMANAC/1\nscope: chat\nStudio | NOW | Tools are ready.");
    expect(parsed.coverage).toBeNull();
    expect(parsed.result).toBeNull();
    expect(parsed.fatalErrors).toEqual([]);
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
