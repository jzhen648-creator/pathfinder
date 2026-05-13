import { z } from "zod";

/** POST `/api/goals/[goalId]/milestones` — Phase 1 tree write convergence (relational append). */
export const appendCanonicalTreeMilestoneBodySchema = z
  .object({
    title: z.string().trim().min(1, "Milestone title is required").max(200),
  })
  .strict();

export type AppendCanonicalTreeMilestoneBody = z.infer<typeof appendCanonicalTreeMilestoneBodySchema>;
