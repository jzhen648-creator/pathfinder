import { z } from "zod";

/** POST `/api/goals/[goalId]/milestones` — Phase 1 tree write convergence (relational append). */
export const appendCanonicalTreeMilestoneBodySchema = z
  .object({
    title: z.string().trim().min(1, "Milestone title is required").max(200),
    dueDate: z
      .string()
      .min(1)
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid dueDate")
      .optional(),
  })
  .strict();

export type AppendCanonicalTreeMilestoneBody = z.infer<typeof appendCanonicalTreeMilestoneBodySchema>;
