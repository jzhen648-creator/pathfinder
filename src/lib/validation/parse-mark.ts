import { z } from "zod";
import { resolveThemeIdFromBody } from "@/lib/theme-id";

export const parseMarkRequestSchema = z.object({
  text: z.string().min(1, "text is required"),
  branchId: z.string().min(1, "branchId is required"),
  limbId: z.string().min(1, "limbId is required"),
});

export type ParseMarkRequest = z.infer<typeof parseMarkRequestSchema>;

export const parseMarkResponseSchema = z.object({
  title: z.string().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  /** Calendar date when the moment happened (YYYY-MM-DD preferred); null if unknown — client may default to today. */
  date: z.union([z.string(), z.null()]),
  confidence: z.coerce.number().min(0).max(1),
  branchId: z.string().min(1),
  limbId: z.string().min(1),
});

export type ParseMarkResponse = z.infer<typeof parseMarkResponseSchema>;
