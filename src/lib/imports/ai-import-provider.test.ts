import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiImportExtractionProvider,
  ImportProviderResponseParseError,
  parseImportProviderContent,
} from "./ai-import-provider";

const mocks = vi.hoisted(() => ({
  generateJsonCompletion: vi.fn(),
}));

vi.mock("@/lib/ai-client", () => ({
  generateJsonCompletion: mocks.generateJsonCompletion,
}));

const providerInput = {
  userId: "user-1",
  sourceId: "source-1",
  segmentPosition: 0,
  segmentText: "I completed CeMAP.",
  context: { goals: [], observations: [] },
};

beforeEach(() => {
  mocks.generateJsonCompletion.mockReset();
});

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

  it("returns a valid response without spending a repair call", async () => {
    mocks.generateJsonCompletion.mockResolvedValueOnce('{"candidates":[]}');

    await expect(aiImportExtractionProvider.extractSegment(providerInput)).resolves.toEqual({
      candidates: [],
    });
    expect(mocks.generateJsonCompletion).toHaveBeenCalledTimes(1);
  });

  it("makes one bounded re-extraction when the first response violates the contract", async () => {
    const privateMalformedOutput = JSON.stringify({
      candidates: [{ proposedText: "private source body" }],
    });
    mocks.generateJsonCompletion
      .mockResolvedValueOnce(privateMalformedOutput)
      .mockResolvedValueOnce('{"candidates":[]}');

    await expect(aiImportExtractionProvider.extractSegment(providerInput)).resolves.toEqual({
      candidates: [],
    });
    expect(mocks.generateJsonCompletion).toHaveBeenCalledTimes(2);
    const repairRequest = mocks.generateJsonCompletion.mock.calls[1]?.[0] as { user: string };
    expect(repairRequest.user).toContain("<provider_correction>");
    expect(repairRequest.user).not.toContain("private source body");
  });

  it("fails safely after one unsuccessful repair", async () => {
    mocks.generateJsonCompletion.mockResolvedValue('{"candidates":[{}]}');

    await expect(aiImportExtractionProvider.extractSegment(providerInput)).rejects.toMatchObject({
      code: "MALFORMED_PROVIDER_OUTPUT",
    });
    expect(mocks.generateJsonCompletion).toHaveBeenCalledTimes(2);
  });
});
