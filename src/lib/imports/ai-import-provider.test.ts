import { describe, expect, it } from "vitest";
import {
  ImportProviderResponseParseError,
  parseImportProviderContent,
} from "./ai-import-provider";

describe("import provider JSON parsing", () => {
  it("parses a plain JSON object", () => {
    expect(parseImportProviderContent('{"candidates":[]}')).toEqual({ candidates: [] });
  });

  it("defensively unwraps one Markdown JSON fence", () => {
    expect(parseImportProviderContent('```json\n{"candidates":[]}\n```')).toEqual({ candidates: [] });
  });

  it("reports only safe shape diagnostics for malformed private output", () => {
    const privateOutput = '{"candidates":[{"proposedText":"private source body"}]';
    expect(() => parseImportProviderContent(privateOutput)).toThrow(ImportProviderResponseParseError);
    try {
      parseImportProviderContent(privateOutput);
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_PROVIDER_JSON",
        contentLength: privateOutput.length,
        lookedFenced: false,
        lookedComplete: false,
      });
      expect(String(error)).not.toContain("private source body");
    }
  });
});
