import { z } from "zod";

export const parseGoalRequestSchema = z.object({
  text: z.string().min(1, "text is required"),
  branchId: z.string().min(1, "branchId is required"),
  areaId: z.string().min(1, "areaId is required"),
});

export type ParseGoalRequest = z.infer<typeof parseGoalRequestSchema>;

export const parseGoalResponseSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["milestone", "practice"]),
  targetDate: z.union([z.string(), z.null()]),
  significance: z.coerce.number().min(1).max(5),
  confidence: z.coerce.number().min(0).max(1),
  branchId: z.string().min(1),
  areaId: z.string().min(1),
});

export type ParseGoalResponse = z.infer<typeof parseGoalResponseSchema>;
