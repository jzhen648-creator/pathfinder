import { z } from "zod";
import { resolveBranchIdFromBody } from "@/lib/category-id";
import { resolveThemeIdFromBody } from "@/lib/theme-id";
import { GOAL_TYPE_VALUES, type GoalType } from "@/lib/goal-type";

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
    /** Phase 2 alias for `branchId` (taxonomy category row id). */
    categoryId: z.string().optional(),
    goalType: z.enum(GOAL_TYPE_VALUES),
    bloomStatus: z.enum(["ACTIVE", "MAINTAINING", "PAUSED", "COMPLETE"]).optional(),
    deadline: z.string(),
    significance: z.coerce.number().int(),
    hasMeasurableTarget: z.boolean(),
    targetAmount: z.string(),
    currentAmount: z.string(),
    unit: z.string(),
    /** When true, generate and persist relational milestones after goal creation. */
    generateRoadmap: z.boolean().optional(),
    /** Optional insert-and-reflow anchor — omit to append at the end of the branch line. */
    anchor: sequenceAnchorSchema,
    /** World hex grid pin — both required when either is set. */
    mapGridQ: z.number().int().optional(),
    mapGridR: z.number().int().optional(),
    /** Optional pursuit start date (YYYY-MM-DD) for timeline + AI pace facts. */
    timelineStart: z.string().optional(),
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
    if (!branchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Category is required (branchId or categoryId)",
        path: ["branchId"],
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

    if (data.significance < 1 || data.significance > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Significance must be between 1 and 5",
        path: ["significance"],
      });
    }

    if (data.hasMeasurableTarget) {
      const target = Number(data.targetAmount);
      if (!Number.isFinite(target) || target <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Target amount must be a positive number",
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
  })
  .transform((data) => ({
    ...data,
    branchId: resolveBranchIdFromBody(data),
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
