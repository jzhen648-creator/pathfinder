import { describe, expect, it } from "vitest";
import {
  ImportProviderOutputError,
  assertExtractionEvidenceMatchesSegment,
  importExtractionResultSchema,
  normalizeExtractionEvidenceOffsets,
  normalizeImportExtractionOutput,
  parseImportExtractionResult,
} from "./extraction-contract";

const validCandidate = {
  id: "candidate-1",
  classification: "update",
  canonicalKey: "career-direction",
  proposedText: "I now intend to move into product design.",
  informationType: "commitment",
  subjectType: "user",
  subjectLabel: null,
  memoryDestination: "chapter",
  backgroundCategory: null,
  temporal: {
    state: "planned",
    precision: "unknown",
    effectiveFrom: null,
    effectiveTo: null,
  },
  evidence: [
    {
      startOffset: 0,
      endOffset: 41,
      quote: "I now intend to move into product design.",
      role: "supports",
      supportType: "explicit",
    },
  ],
  confidence: 0.84,
  targetGoalIds: ["goal-1"],
  existingObservationId: "observation-1",
  rationale: "The source states a changed intention explicitly.",
};

describe("import extraction contract", () => {
  it("accepts bounded, structured candidates", () => {
    expect(parseImportExtractionResult({ candidates: [validCandidate] })).toEqual({
      candidates: [validCandidate],
    });
  });

  it("rejects unknown fields and invalid confidence", () => {
    expect(
      importExtractionResultSchema.safeParse({
        candidates: [{ ...validCandidate, confidence: 4, hiddenInstruction: "ignore rules" }],
      }).success,
    ).toBe(false);
  });

  it("caps provider output at twenty candidates", () => {
    expect(
      importExtractionResultSchema.safeParse({
        candidates: Array.from({ length: 21 }, (_, index) => ({
          ...validCandidate,
          id: `candidate-${index}`,
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects background memory without a typed destination", () => {
    expect(
      importExtractionResultSchema.safeParse({
        candidates: [
          {
            ...validCandidate,
            memoryDestination: "background",
            backgroundCategory: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires another person's information to name its subject", () => {
    expect(
      importExtractionResultSchema.safeParse({
        candidates: [
          {
            ...validCandidate,
            subjectType: "other_person",
            subjectLabel: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a cited new chapter only with a title and primary theme", () => {
    const candidate = {
      ...validCandidate,
      classification: "new_chapter",
      chapterTitle: "Return to London",
      primaryThemeId: "people",
      groupName: "Rebuild my London life",
      targetGoalIds: [],
      existingObservationId: null,
    };
    expect(importExtractionResultSchema.safeParse({ candidates: [candidate] }).success).toBe(true);

    for (const invalid of [
      { ...candidate, chapterTitle: null },
      { ...candidate, primaryThemeId: null },
      { ...candidate, targetGoalIds: ["existing-goal"] },
      { ...candidate, subjectType: "other_person", subjectLabel: "Brother" },
      { ...candidate, informationType: "possibility" },
    ]) {
      expect(importExtractionResultSchema.safeParse({ candidates: [invalid] }).success).toBe(false);
    }
  });

  it("does not allow chapter draft fields on ordinary updates", () => {
    expect(
      importExtractionResultSchema.safeParse({
        candidates: [{ ...validCandidate, chapterTitle: "Unexpected", groupName: "Unexpected" }],
      }).success,
    ).toBe(false);
  });

  it("normalizes a complete untargeted chapter draft from new to new_chapter", () => {
    const candidate = {
      ...validCandidate,
      classification: "new",
      chapterTitle: "Test a small tour service",
      primaryThemeId: "work",
      groupName: "Test a side business",
      targetGoalIds: [],
      existingObservationId: null,
    };
    expect(normalizeImportExtractionOutput({ candidates: [candidate] })).toMatchObject({
      candidates: [{ classification: "new_chapter" }],
    });
    expect(parseImportExtractionResult({ candidates: [candidate] }).candidates[0]).toMatchObject({
      classification: "new_chapter",
      chapterTitle: "Test a small tour service",
      primaryThemeId: "work",
    });
  });

  it("normalizes a complete chapter draft when the provider transposes destination and classification", () => {
    const candidate = {
      ...validCandidate,
      classification: "new",
      memoryDestination: "new_chapter",
      chapterTitle: "Build mortgage-adviser experience",
      primaryThemeId: "work",
      groupName: "Build my London career",
      targetGoalIds: undefined,
      existingObservationId: null,
    };

    expect(parseImportExtractionResult({ candidates: [candidate] }).candidates[0]).toMatchObject({
      classification: "new_chapter",
      memoryDestination: "chapter",
      chapterTitle: "Build mortgage-adviser experience",
      primaryThemeId: "work",
      targetGoalIds: [],
    });
  });

  it("demotes an untargeted chapter reinforcement to source-only", () => {
    const candidate = {
      ...validCandidate,
      classification: "reinforcement",
      memoryDestination: "chapter",
      targetGoalIds: [],
      existingObservationId: null,
    };

    expect(parseImportExtractionResult({ candidates: [candidate] }).candidates[0]).toMatchObject({
      classification: "reinforcement",
      memoryDestination: "source_only",
      targetGoalIds: [],
    });
  });

  it("normalizes an information-type value misplaced in classification", () => {
    const candidate = { ...validCandidate, classification: "commitment" };
    expect(parseImportExtractionResult({ candidates: [candidate] }).candidates[0]).toMatchObject({
      classification: "new",
      informationType: "commitment",
      targetGoalIds: ["goal-1"],
    });
  });

  it("clears unsupported approximate date strings without inventing an exact day", () => {
    const candidate = {
      ...validCandidate,
      temporal: {
        ...validCandidate.temporal,
        precision: "approximate",
        effectiveFrom: "late August 2026",
      },
    };
    expect(parseImportExtractionResult({ candidates: [candidate] }).candidates[0]?.temporal).toEqual({
      state: "planned",
      precision: "approximate",
      effectiveFrom: null,
      effectiveTo: null,
    });
  });

  it("fills a missing temporal object with unknown rather than inventing time", () => {
    const { temporal: _temporal, ...candidate } = validCandidate;
    expect(parseImportExtractionResult({ candidates: [candidate] }).candidates[0]?.temporal).toEqual({
      state: "unknown",
      precision: "unknown",
      effectiveFrom: null,
      effectiveTo: null,
    });
  });

  it("accepts only evidence that exactly matches the source segment", () => {
    const result = parseImportExtractionResult({ candidates: [validCandidate] });
    expect(assertExtractionEvidenceMatchesSegment(result, validCandidate.evidence[0].quote)).toBe(
      result,
    );
    expect(() => assertExtractionEvidenceMatchesSegment(result, "Different private text.")).toThrow(
      ImportProviderOutputError,
    );
  });

  it("derives exact offsets locally when a provider quote occurs once", () => {
    const source = "Prefix. The exact durable fact. Suffix.";
    const candidate = {
      ...validCandidate,
      evidence: [
        {
          ...validCandidate.evidence[0],
          startOffset: 0,
          endOffset: 5,
          quote: "The exact durable fact.",
        },
      ],
    };
    const parsed = parseImportExtractionResult({ candidates: [candidate] });
    const normalized = normalizeExtractionEvidenceOffsets(parsed, source);
    expect(normalized.candidates[0]?.evidence[0]).toMatchObject({
      startOffset: 8,
      endOffset: 31,
      quote: "The exact durable fact.",
    });
    expect(assertExtractionEvidenceMatchesSegment(normalized, source)).toBe(normalized);
  });

  it("rejects missing or ambiguous provider quotes instead of guessing", () => {
    const candidate = {
      ...validCandidate,
      evidence: [
        {
          ...validCandidate.evidence[0],
          startOffset: 99,
          endOffset: 100,
          quote: "Repeated fact.",
        },
      ],
    };
    const parsed = parseImportExtractionResult({ candidates: [candidate] });
    expect(() => normalizeExtractionEvidenceOffsets(parsed, "Repeated fact. Repeated fact.")).toThrow(
      ImportProviderOutputError,
    );
    expect(() => normalizeExtractionEvidenceOffsets(parsed, "Different fact.")).toThrow(
      ImportProviderOutputError,
    );
  });

  it("uses a safe error that does not echo provider output", () => {
    const privateOutput = { candidates: [{ proposedText: "private source body" }] };
    expect(() => parseImportExtractionResult(privateOutput)).toThrow(ImportProviderOutputError);
    try {
      parseImportExtractionResult(privateOutput);
    } catch (error) {
      expect(String(error)).not.toContain("private source body");
    }
  });
});
