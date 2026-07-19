import {
  CURRENT_FOCUS_MAX_CHARS,
  chapterTypeSchema,
  identityFactsSchema,
} from "@/lib/chapter-types";
import { SIGNIFICANCE_MAX } from "@/lib/pursuit/significance";
import { resolveBranchIdFromBody } from "@/lib/category-id";
import { GOAL_TYPE_VALUES, type GoalType } from "@/lib/goal-type";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { z } from "zod";

const themeIdSchema = z.enum(LIFE_AREA_IDS);

export { GOAL_TYPE_VALUES };
export type CreateGoalGoalType = GoalType;

/**
 * Optional anchor for insert-and-reflow on the branch line. When omitted the goal is appended.
 * `between` places the new node at the midpoint of `afterNodeId` and `beforeNodeId`'s
 * `sequencePosition` (the branch is reindexed if midpoint precision collapses).
 */
const sequenceAnchorSchema = z
  .union([
    z.object({ kind: z.literal("append") }),
    z.object({ kind: z.literal("after"), nodeId: z.string().min(1) }),
    z.object({ kind: z.literal("before"), nodeId: z.string().min(1) }),
    z.object({
      kind: z.literal("between"),
      afterNodeId: z.string().min(1),
      beforeNodeId: z.string().min(1),
    }),
  ])
  .optional();

/** Shared shape for client form + POST /api/goals JSON body. */
export const createGoalPayloadSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    branchId: z.string().optional(),
    /** Taxonomy category row id — optional when themeId is provided (server derives). */
    categoryId: z.string().optional(),
    /**
     * Theme for name-first create. Required when categoryId/branchId omitted so
     * the server can derive an internal category.
     */
    themeId: themeIdSchema.optional(),
    goalType: z.enum(GOAL_TYPE_VALUES),
    /** Canonical pursuit status on create. */
    status: z.enum(["ACTIVE", "MAINTAINING", "PAUSED", "COMPLETE"]).optional(),
    /** @deprecated Use `status`. */
    bloomStatus: z.enum(["ACTIVE", "MAINTAINING", "PAUSED", "COMPLETE"]).optional(),
    deadline: z.string(),
    /** Omitted or null on create = unset; validated 1–3 when present. */
    significance: z.coerce.number().int().nullable().optional(),
    hasMeasurableTarget: z.boolean(),
    targetAmount: z.string(),
    currentAmount: z.string(),
    unit: z.string(),
    /** gross | net for flow income amounts. */
    amountBasis: z.string().optional(),
    /** When true, generate and persist relational milestones after goal creation. */
    generateRoadmap: z.boolean().optional(),
    /** Optional insert-and-reflow anchor — omit to append at the end of the branch line. */
    anchor: sequenceAnchorSchema,
    /** World hex grid pin — both required when either is set. */
    mapGridQ: z.number().int().optional(),
    mapGridR: z.number().int().optional(),
    /** Optional suggest-add provenance — source pursuit id. */
    createdFromGoalId: z.string().optional(),
    /** Optional pursuit start date (YYYY-MM-DD) for timeline + AI pace facts. */
    timelineStart: z.string().optional(),
    /** When creating a historical record — completion date (YYYY-MM-DD). Requires status COMPLETE. */
    completedAt: z.string().optional(),
    /** Universal chapter archetype; omit/null = Custom Chapter. */
    chapterType: chapterTypeSchema.nullable().optional(),
    /** Structured identity facts for typed chapters. */
    identityFacts: identityFactsSchema.nullable().optional(),
    /** What matters now within this chapter. */
    currentFocus: z.string().max(CURRENT_FOCUS_MAX_CHARS).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const title = data.title.trim();
    if (title.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Title is required",
        path: ["title"],
      });
    } else if (title.length > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Title must be at most 100 characters",
        path: ["title"],
      });
    }

    if (data.description.length > 500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Description must be at most 500 characters",
        path: ["description"],
      });
    }

    const branchId = resolveBranchIdFromBody(data);
    if (!branchId && !data.themeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "themeId is required when categoryId is omitted",
        path: ["themeId"],
      });
    }

    const deadlineTrim = data.deadline.trim();
    if (data.goalType === "project" && deadlineTrim.length > 0) {
      const parsed = parseLocalDateOnly(deadlineTrim);
      if (!parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Deadline must be a valid date",
          path: ["deadline"],
        });
      }
    }

    if (
      data.significance != null &&
      (data.significance < 1 || data.significance > SIGNIFICANCE_MAX)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Significance must be between 1 and 3",
        path: ["significance"],
      });
    }

    if (data.hasMeasurableTarget) {
      const target = Number(data.targetAmount);
      const current = Number(data.currentAmount);
      const targetValid = Number.isFinite(target) && target > 0;
      const currentValid = Number.isFinite(current) && current > 0;
      if (targetValid) {
        if (!Number.isFinite(current) || current < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Current amount must be zero or a positive number",
            path: ["currentAmount"],
          });
        }
      } else if (!currentValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a positive target or current amount",
          path: ["targetAmount"],
        });
      }
    }

    const qSet = data.mapGridQ !== undefined;
    const rSet = data.mapGridR !== undefined;
    if (qSet !== rSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mapGridQ and mapGridR must be provided together",
        path: ["mapGridQ"],
      });
    }

    const timelineStartTrim = data.timelineStart?.trim() ?? "";
    if (timelineStartTrim.length > 0 && !parseLocalDateOnly(timelineStartTrim)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "timelineStart must be a valid date",
        path: ["timelineStart"],
      });
    }

    const completedAtTrim = data.completedAt?.trim() ?? "";
    const createStatus = data.status ?? data.bloomStatus;
    if (completedAtTrim.length > 0) {
      if (createStatus !== "COMPLETE") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "completedAt requires status COMPLETE",
          path: ["completedAt"],
        });
      } else if (!parseLocalDateOnly(completedAtTrim)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "completedAt must be a valid date",
          path: ["completedAt"],
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    categoryId: resolveBranchIdFromBody(data),
    status: data.status ?? data.bloomStatus,
  }));

export type CreateGoalPayloadInput = z.input<typeof createGoalPayloadSchema>;
export type CreateGoalPayload = z.infer<typeof createGoalPayloadSchema>;

export function parseLocalDateOnly(yyyyMmDd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Start of local calendar day */
export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** True when the deadline calendar day is strictly after today (local). */
export function deadlineIsInFutureLocal(deadline: Date): boolean {
  const today = startOfLocalDay(new Date());
  const end = startOfLocalDay(deadline);
  return end.getTime() > today.getTime();
}
