import { z } from "zod";

/** PATCH `/api/goals/[goalId]` — at least one field required. */
export const updateGoalPayloadSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    significance: z.coerce.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    const hasField =
      data.title !== undefined || data.description !== undefined || data.significance !== undefined;
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
