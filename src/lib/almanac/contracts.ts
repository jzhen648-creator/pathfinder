import { z } from "zod";
import {
  ALMANAC_PLACE_NAME_MAX_LENGTH,
  ALMANAC_RAW_PACKET_MAX_LENGTH,
  ALMANAC_UPDATE_TEXT_MAX_LENGTH,
  ALMANAC_UPDATE_STATES,
} from "@/lib/almanac/protocol";

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

export const ALMANAC_SUBJECT_ICON_KEYS = [
  "activity",
  "book-open",
  "briefcase-business",
  "circle",
  "compass",
  "house",
  "landmark",
  "wallet",
] as const;

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
