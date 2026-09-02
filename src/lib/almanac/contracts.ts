import { z } from "zod";
import {
  ALMANAC_ORIGIN_KINDS,
  ALMANAC_PLACE_NAME_MAX_LENGTH,
  ALMANAC_RAW_PACKET_MAX_LENGTH,
  ALMANAC_TARGET_DATE_PRECISIONS,
  ALMANAC_UPDATE_TEXT_MAX_LENGTH,
  ALMANAC_UPDATE_SIGNIFICANCE,
  ALMANAC_UPDATE_STATES,
} from "@/lib/almanac/protocol";
import { ALMANAC_SUBJECT_ICON_KEYS } from "@/lib/almanac/subject-icons";

const almanacRecordIdSchema = z.string().trim().min(1).max(128);

function isExactCalendarDate(year: number, month: number, day: number): boolean {
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, month - 1, day);
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

/** A locale-neutral partial date. Null components are intentional, not guessed. */
export const almanacTargetDateSchema = z
  .object({
    precision: z.enum(ALMANAC_TARGET_DATE_PRECISIONS),
    year: z.number().int().min(1).max(9999),
    month: z.number().int().min(1).max(12).nullable().default(null),
    day: z.number().int().min(1).max(31).nullable().default(null),
  })
  .strict()
  .superRefine((targetDate, context) => {
    if (targetDate.precision === "YEAR" && (targetDate.month !== null || targetDate.day !== null)) {
      context.addIssue({
        code: "custom",
        message: "A year target must not invent a month or day.",
      });
      return;
    }
    if (
      targetDate.precision === "MONTH" &&
      (targetDate.month === null || targetDate.day !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A month target needs a month and must not invent a day.",
      });
      return;
    }
    if (
      targetDate.precision === "DAY" &&
      (targetDate.month === null ||
        targetDate.day === null ||
        !isExactCalendarDate(targetDate.year, targetDate.month, targetDate.day))
    ) {
      context.addIssue({ code: "custom", message: "Choose a valid calendar date." });
    }
  });

export const almanacUpdateCurationRequestSchema = z
  .object({
    significance: z.enum(ALMANAC_UPDATE_SIGNIFICANCE).optional(),
    targetDate: almanacTargetDateSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) => input.significance !== undefined || input.targetDate !== undefined,
    { message: "Choose at least one curation change." },
  );

export const almanacUpdateCurationResponseSchema = z
  .object({
    hidden: z.boolean(),
    significance: z.enum(ALMANAC_UPDATE_SIGNIFICANCE),
    targetDate: almanacTargetDateSchema.nullable(),
  })
  .strict();

export const almanacUpdateResponseMetadataSchema = z
  .object({
    originKind: z.enum(ALMANAC_ORIGIN_KINDS),
    supersedesUpdateId: almanacRecordIdSchema.nullable(),
    supersedesUpdateIds: z.array(almanacRecordIdSchema),
    supersededByUpdateId: almanacRecordIdSchema.nullable(),
    supersededByUpdateIds: z.array(almanacRecordIdSchema),
    curation: almanacUpdateCurationResponseSchema,
  })
  .strict();

export const almanacLineDecisionSchema = z
  .object({
    lineNumber: z.number().int().min(3),
    accepted: z.boolean(),
    /** Explicit user resolution to an existing owner-scoped Place. Null means
     * keep/reuse the packet's deterministic Place name. */
    placeId: z.string().trim().min(1).max(128).nullable().optional(),
    /** Explicit correction target. The server never infers supersession. */
    supersedesUpdateId: z.string().trim().min(1).max(128).nullable().optional(),
    /** Optional user correction. The immutable raw packet is still retained unchanged. */
    subjectName: z.string().trim().min(1).max(ALMANAC_PLACE_NAME_MAX_LENGTH).optional(),
    state: z.enum(ALMANAC_UPDATE_STATES).optional(),
    statement: z.string().trim().min(1).max(ALMANAC_UPDATE_TEXT_MAX_LENGTH).optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (
      !decision.accepted &&
      (decision.placeId ||
        decision.supersedesUpdateId ||
        decision.subjectName !== undefined ||
        decision.state !== undefined ||
        decision.statement !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Rejected lines cannot resolve a Subject, correct values or supersede an Update.",
      });
    }
  });

export const commitAlmanacImportRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
    rawPacket: z.string().min(1).max(ALMANAC_RAW_PACKET_MAX_LENGTH),
    decisions: z.array(almanacLineDecisionSchema).max(12),
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<number>();
    for (const decision of input.decisions) {
      if (seen.has(decision.lineNumber)) {
        context.addIssue({
          code: "custom",
          path: ["decisions"],
          message: `Line ${decision.lineNumber} has more than one decision.`,
        });
      }
      seen.add(decision.lineNumber);
    }
  });

export type CommitAlmanacImportRequest = z.infer<typeof commitAlmanacImportRequestSchema>;

export const ALMANAC_DIRECT_UPDATE_ACTIONS = [
  "correction",
  "outcome",
  "resolution",
] as const;

export const createDirectAlmanacSubjectUpdateRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
    action: z.enum(ALMANAC_DIRECT_UPDATE_ACTIONS),
    state: z.enum(ALMANAC_UPDATE_STATES),
    statement: z
      .string()
      .min(1)
      .max(ALMANAC_UPDATE_TEXT_MAX_LENGTH)
      .refine((value) => value.trim().length > 0, { message: "Update wording is required." })
      .refine((value) => !/[\r\n]/u.test(value), {
        message: "Update wording must fit on one source line.",
      }),
    supersedesUpdateIds: z.array(almanacRecordIdSchema).min(1).max(100),
    curation: almanacUpdateCurationRequestSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.supersedesUpdateIds).size !== input.supersedesUpdateIds.length) {
      context.addIssue({
        code: "custom",
        path: ["supersedesUpdateIds"],
        message: "Choose each earlier Update only once.",
      });
    }
    if (input.action !== "resolution" && input.supersedesUpdateIds.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["supersedesUpdateIds"],
        message: `${input.action === "correction" ? "A correction" : "An outcome"} must replace exactly one Update.`,
      });
    }
    if (input.action === "resolution" && input.supersedesUpdateIds.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["supersedesUpdateIds"],
        message: "A resolution must explicitly replace at least two Updates.",
      });
    }
    if (input.action === "outcome" && input.state === "OPEN") {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "An open-question outcome must be NOW, NEXT or DONE.",
      });
    }
    if (input.curation?.targetDate && input.state !== "NEXT") {
      context.addIssue({
        code: "custom",
        path: ["curation", "targetDate"],
        message: "Only a NEXT Update can have a target date.",
      });
    }
  });

export type CreateDirectAlmanacSubjectUpdateRequest = z.infer<
  typeof createDirectAlmanacSubjectUpdateRequestSchema
>;

export const directAlmanacSubjectUpdateResponseSchema = z
  .object({
    disposition: z.enum(["created", "idempotent_retry"]),
    importId: almanacRecordIdSchema,
    updateId: almanacRecordIdSchema,
    scope: z.literal("direct"),
    originKind: z.literal("USER_ENTRY"),
    supersedesUpdateIds: z.array(almanacRecordIdSchema).min(1),
    curation: almanacUpdateCurationResponseSchema,
    atlas: z.unknown(),
  })
  .strict();

export type DirectAlmanacSubjectUpdateResponse = z.infer<
  typeof directAlmanacSubjectUpdateResponseSchema
>;

export const updateAlmanacSubjectRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(ALMANAC_PLACE_NAME_MAX_LENGTH).nullable().optional(),
    iconKey: z.enum(ALMANAC_SUBJECT_ICON_KEYS).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.displayName !== undefined || input.iconKey !== undefined || input.archived !== undefined,
    { message: "Choose at least one Subject change." },
  );

export const mergeAlmanacSubjectsRequestSchema = z
  .object({
    sourceSubjectId: z.string().trim().min(1).max(128),
    targetSubjectId: z.string().trim().min(1).max(128),
    displayName: z.string().trim().min(1).max(ALMANAC_PLACE_NAME_MAX_LENGTH),
  })
  .strict()
  .refine((input) => input.sourceSubjectId !== input.targetSubjectId, {
    message: "Choose two different Subjects.",
  });

export type UpdateAlmanacSubjectRequest = z.infer<typeof updateAlmanacSubjectRequestSchema>;
export type MergeAlmanacSubjectsRequest = z.infer<typeof mergeAlmanacSubjectsRequestSchema>;

export const updateAlmanacUpdatePreferenceRequestSchema = z
  .object({
    hidden: z.boolean().optional(),
    significance: z.enum(ALMANAC_UPDATE_SIGNIFICANCE).optional(),
    targetDate: almanacTargetDateSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.hidden !== undefined ||
      input.significance !== undefined ||
      input.targetDate !== undefined,
    { message: "Choose at least one Update change." },
  );

export type UpdateAlmanacUpdatePreferenceRequest = z.infer<
  typeof updateAlmanacUpdatePreferenceRequestSchema
>;

export const updateAlmanacUpdatePreferenceResponseSchema = z
  .object({
    updateId: almanacRecordIdSchema,
    curation: almanacUpdateCurationResponseSchema,
    atlas: z.unknown(),
  })
  .strict();

export type UpdateAlmanacUpdatePreferenceResponse = z.infer<
  typeof updateAlmanacUpdatePreferenceResponseSchema
>;
