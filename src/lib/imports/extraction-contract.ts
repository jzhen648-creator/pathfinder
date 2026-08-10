import { z } from "zod";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

export const importCandidateClassificationSchema = z.enum([
  "new",
  "reinforcement",
  "update",
  "conflict",
  "possible_connection",
  "new_chapter",
  "no_durable_value",
  "uncertain",
]);

export const importInformationTypeSchema = z.enum([
  "fact",
  "event",
  "aspiration",
  "decision",
  "commitment",
  "possibility",
  "tension",
  "open_question",
  "preference",
  "context",
  "interpretation",
  "advice",
]);

export const importSubjectTypeSchema = z.enum(["user", "other_person", "shared", "unknown"]);

export const importMemoryDestinationSchema = z.enum([
  "chapter",
  "background",
  "possibility",
  "source_only",
]);

export const importPrimaryThemeIdSchema = z.enum(LIFE_AREA_IDS);

export const importBackgroundCategorySchema = z.enum([
  "identity",
  "people",
  "places",
  "work_qualifications",
  "assets_finances",
  "health",
  "preferences_constraints",
  "other",
]);

export const importTemporalStateSchema = z.enum([
  "past",
  "current",
  "ongoing",
  "planned",
  "possible",
  "unresolved",
  "unknown",
]);

export const importTemporalPrecisionSchema = z.enum([
  "exact",
  "approximate",
  "range",
  "ongoing",
  "unknown",
]);

export const importEvidenceRoleSchema = z.enum(["supports", "contradicts"]);
export const importSupportTypeSchema = z.enum(["explicit", "inferred", "user_confirmed"]);

const isoDateOrDateTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/)
  .refine(
    (value) => !Number.isNaN(Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value)),
    "Invalid ISO date or timestamp.",
  )
  .nullable();

export const importCandidateEvidenceSchema = z
  .object({
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().positive(),
    quote: z.string().min(1).max(1_000),
    role: importEvidenceRoleSchema.default("supports"),
    supportType: importSupportTypeSchema.default("explicit"),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.endOffset <= evidence.startOffset) {
      context.addIssue({
        code: "custom",
        message: "Evidence endOffset must be greater than startOffset.",
        path: ["endOffset"],
      });
    }
  });

export const importCandidateTemporalSchema = z
  .object({
    state: importTemporalStateSchema,
    precision: importTemporalPrecisionSchema,
    effectiveFrom: isoDateOrDateTimeSchema.optional().default(null),
    effectiveTo: isoDateOrDateTimeSchema.optional().default(null),
  })
  .strict();

export const importExtractionCandidateSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    classification: importCandidateClassificationSchema,
    canonicalKey: z.string().trim().min(1).max(160).nullable().optional(),
    proposedText: z.string().trim().min(1).max(1_000),
    chapterTitle: z.string().trim().min(1).max(100).nullable().optional(),
    primaryThemeId: importPrimaryThemeIdSchema.nullable().optional(),
    groupName: z.string().trim().min(1).max(100).nullable().optional(),
    informationType: importInformationTypeSchema,
    subjectType: importSubjectTypeSchema,
    subjectLabel: z.string().trim().min(1).max(160).nullable().optional(),
    memoryDestination: importMemoryDestinationSchema,
    backgroundCategory: importBackgroundCategorySchema.nullable().optional(),
    temporal: importCandidateTemporalSchema,
    evidence: z.array(importCandidateEvidenceSchema).min(1).max(5),
    confidence: z.number().min(0).max(1),
    targetGoalIds: z.array(z.string().trim().min(1).max(128)).max(5).default([]),
    existingObservationId: z.string().trim().min(1).max(128).nullable().optional(),
    rationale: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.classification === "new_chapter") {
      if (candidate.memoryDestination !== "chapter") {
        context.addIssue({
          code: "custom",
          message: "New chapter proposals must use the chapter destination.",
          path: ["memoryDestination"],
        });
      }
      if (!candidate.chapterTitle) {
        context.addIssue({
          code: "custom",
          message: "New chapter proposals require a chapterTitle.",
          path: ["chapterTitle"],
        });
      }
      if (!candidate.primaryThemeId) {
        context.addIssue({
          code: "custom",
          message: "New chapter proposals require a primaryThemeId.",
          path: ["primaryThemeId"],
        });
      }
      if (candidate.targetGoalIds.length > 0) {
        context.addIssue({
          code: "custom",
          message: "New chapter proposals cannot target an existing chapter.",
          path: ["targetGoalIds"],
        });
      }
      if (candidate.subjectType === "other_person") {
        context.addIssue({
          code: "custom",
          message: "Another person's information cannot create the user's chapter.",
          path: ["subjectType"],
        });
      }
      if (["possibility", "advice", "interpretation"].includes(candidate.informationType)) {
        context.addIssue({
          code: "custom",
          message: "Possibility, advice, and interpretation cannot create a chapter.",
          path: ["informationType"],
        });
      }
    } else if (candidate.chapterTitle || candidate.primaryThemeId || candidate.groupName) {
      context.addIssue({
        code: "custom",
        message: "Chapter draft fields are only valid for new_chapter proposals.",
        path: ["chapterTitle"],
      });
    }
    if (
      candidate.memoryDestination === "chapter" &&
      candidate.classification !== "new_chapter" &&
      candidate.targetGoalIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Existing chapter updates require a targetGoalId.",
        path: ["targetGoalIds"],
      });
    }
    if (candidate.memoryDestination === "background" && !candidate.backgroundCategory) {
      context.addIssue({
        code: "custom",
        message: "Background proposals require a backgroundCategory.",
        path: ["backgroundCategory"],
      });
    }
    if (candidate.subjectType === "other_person" && !candidate.subjectLabel) {
      context.addIssue({
        code: "custom",
        message: "Other-person information requires a subjectLabel.",
        path: ["subjectLabel"],
      });
    }
    if (
      (candidate.classification === "no_durable_value" || candidate.classification === "uncertain") &&
      candidate.memoryDestination !== "source_only"
    ) {
      context.addIssue({
        code: "custom",
        message: "Retained-only candidates must use the source_only destination.",
        path: ["memoryDestination"],
      });
    }
  });

export const importExtractionResultSchema = z
  .object({
    candidates: z.array(importExtractionCandidateSchema).max(20),
  })
  .strict();

export type ImportExtractionCandidate = z.infer<typeof importExtractionCandidateSchema>;
export type ImportCandidateEvidence = z.infer<typeof importCandidateEvidenceSchema>;
export type ImportExtractionResult = z.infer<typeof importExtractionResultSchema>;

export class ImportProviderOutputError extends Error {
  readonly code = "MALFORMED_PROVIDER_OUTPUT";

  constructor() {
    super("The import provider returned output that did not match the extraction contract.");
    this.name = "ImportProviderOutputError";
  }
}

/**
 * Repair narrow mechanical provider inconsistencies without inventing facts:
 * information-type values accidentally placed in classification become a
 * conservative new observation, and a complete untargeted chapter draft is
 * the new_chapter shape even when the model emitted classification "new" or
 * accidentally placed new_chapter in memoryDestination.
 */
export function normalizeImportExtractionOutput(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.candidates)) return output;
  return {
    ...record,
    candidates: record.candidates.map((candidate) => {
      if (!candidate || typeof candidate !== "object") return candidate;
      const value = candidate as Record<string, unknown>;
      let temporal: unknown =
        value.temporal ?? {
          state: "unknown",
          precision: "unknown",
          effectiveFrom: null,
          effectiveTo: null,
        };
      if (temporal && typeof temporal === "object") {
        const normalizedTemporal: Record<string, unknown> = {
          ...(temporal as Record<string, unknown>),
        };
        for (const field of ["effectiveFrom", "effectiveTo"] as const) {
          const date = normalizedTemporal[field];
          if (
            typeof date === "string" &&
            !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
              date,
            )
          ) {
            normalizedTemporal[field] = null;
          }
        }
        temporal = normalizedTemporal;
      }
      const informationTypeValues = new Set([
        "fact",
        "event",
        "aspiration",
        "decision",
        "commitment",
        "possibility",
        "tension",
        "open_question",
        "preference",
        "context",
        "interpretation",
        "advice",
      ]);
      const classificationValues = new Set([
        "new",
        "reinforcement",
        "update",
        "conflict",
        "possible_connection",
        "new_chapter",
        "no_durable_value",
        "uncertain",
      ]);
      const classification =
        typeof value.classification === "string" &&
        !classificationValues.has(value.classification) &&
        informationTypeValues.has(value.classification)
          ? "new"
          : value.classification;
      const memoryDestination =
        value.memoryDestination === "new_chapter" ? "chapter" : value.memoryDestination;
      const normalized: Record<string, unknown> = {
        ...value,
        temporal,
        classification,
        memoryDestination,
      };
      const targets = Array.isArray(normalized.targetGoalIds) ? normalized.targetGoalIds : [];
      if (
        normalized.classification === "new" &&
        normalized.memoryDestination === "chapter" &&
        targets.length === 0 &&
        typeof normalized.chapterTitle === "string" &&
        normalized.chapterTitle.trim().length > 0 &&
        typeof normalized.primaryThemeId === "string" &&
        normalized.primaryThemeId.trim().length > 0
      ) {
        return { ...normalized, classification: "new_chapter", targetGoalIds: [] };
      }
      if (
        normalized.classification === "reinforcement" &&
        normalized.memoryDestination === "chapter" &&
        targets.length === 0
      ) {
        return {
          ...normalized,
          memoryDestination: "source_only",
          targetGoalIds: [],
          chapterTitle: null,
          primaryThemeId: null,
          groupName: null,
        };
      }
      return normalized;
    }),
  };
}

export function parseImportExtractionResult(output: unknown): ImportExtractionResult {
  const parsed = importExtractionResultSchema.safeParse(normalizeImportExtractionOutput(output));
  if (!parsed.success) throw new ImportProviderOutputError();
  return parsed.data;
}

function exactQuoteOffsets(segmentText: string, quote: string): number[] {
  const offsets: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= segmentText.length - quote.length) {
    const offset = segmentText.indexOf(quote, searchFrom);
    if (offset < 0) break;
    offsets.push(offset);
    searchFrom = offset + 1;
  }
  return offsets;
}

/**
 * Providers are poor character counters. Trust an exact quote only when it
 * occurs once, then derive its offsets locally. Missing or ambiguous quotes
 * remain hard failures and never become evidence.
 */
export function normalizeExtractionEvidenceOffsets(
  result: ImportExtractionResult,
  segmentText: string,
): ImportExtractionResult {
  return {
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      evidence: candidate.evidence.map((evidence) => {
        if (
          evidence.endOffset <= segmentText.length &&
          segmentText.slice(evidence.startOffset, evidence.endOffset) === evidence.quote
        ) {
          return evidence;
        }
        const offsets = exactQuoteOffsets(segmentText, evidence.quote);
        if (offsets.length !== 1) throw new ImportProviderOutputError();
        const startOffset = offsets[0]!;
        return { ...evidence, startOffset, endOffset: startOffset + evidence.quote.length };
      }),
    })),
  };
}

/** Provider evidence offsets are local to the supplied segment and must quote it exactly. */
export function assertExtractionEvidenceMatchesSegment(
  result: ImportExtractionResult,
  segmentText: string,
): ImportExtractionResult {
  for (const candidate of result.candidates) {
    for (const evidence of candidate.evidence) {
      if (
        evidence.endOffset > segmentText.length ||
        segmentText.slice(evidence.startOffset, evidence.endOffset) !== evidence.quote
      ) {
        throw new ImportProviderOutputError();
      }
    }
  }
  return result;
}
