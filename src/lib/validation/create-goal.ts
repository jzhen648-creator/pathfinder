import { z } from "zod";

export const GOAL_TYPE_VALUES = ["project", "practice", "identity"] as const;
export type CreateGoalGoalType = (typeof GOAL_TYPE_VALUES)[number];

/** Shared shape for client form + POST /api/goals JSON body. */
export const createGoalPayloadSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    branchId: z.string(),
    goalType: z.enum(GOAL_TYPE_VALUES),
    deadline: z.string(),
    significance: z.coerce.number().int(),
    hasMeasurableTarget: z.boolean(),
    targetAmount: z.string(),
    currentAmount: z.string(),
    unit: z.string(),
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

    if (!data.branchId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Branch is required",
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
  });

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
