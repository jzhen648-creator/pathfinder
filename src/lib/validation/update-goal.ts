import { z } from "zod";

/** PATCH `/api/goals/[goalId]` — at least one field required. */
const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const updateGoalPayloadSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    significance: z.coerce.number().int().optional(),
    /** Explicit swimlane start; `null` clears override (falls back to createdAt). */
    timelineStart: calendarDaySchema.nullable().optional(),
    /** Target end date; `null` clears deadline. */
    deadline: calendarDaySchema.nullable().optional(),
    /** `false` revives a pursuit removed from the map. */
    archived: z.boolean().optional(),
    bloomStatus: z.enum(["ACTIVE", "ON_HOLD", "COMPLETE", "MAINTAINING"]).optional(),
  })
  .superRefine((data, ctx) => {
    const hasField =
      data.title !== undefined ||
      data.description !== undefined ||
      data.significance !== undefined ||
      data.timelineStart !== undefined ||
      data.deadline !== undefined ||
      data.archived !== undefined ||
      data.bloomStatus !== undefined;
    if (!hasField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required",
      });
      return;
    }
    if (data.title !== undefined) {
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
    }
    if (data.description !== undefined && data.description.length > 500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Description must be at most 500 characters",
        path: ["description"],
      });
    }
    if (data.significance !== undefined && (data.significance < 1 || data.significance > 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Significance must be between 1 and 5",
        path: ["significance"],
      });
    }
  });

export type UpdateGoalPayload = z.infer<typeof updateGoalPayloadSchema>;
