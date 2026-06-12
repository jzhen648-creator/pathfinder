import { z } from "zod";

const sequenceAnchorSchema = z.union([
  z.object({ kind: z.literal("append") }),
  z.object({ kind: z.literal("after"), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal("before"), nodeId: z.string().min(1) }),
  z.object({
    kind: z.literal("between"),
    afterNodeId: z.string().min(1),
    beforeNodeId: z.string().min(1),
  }),
]);

const moveToCategorySchema = z.object({
  categoryId: z.string().min(1),
  sequenceAnchor: sequenceAnchorSchema.optional(),
});

export const goalReorganizeBodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("moveToCategory"),
    ...moveToCategorySchema.shape,
  }),
  z.object({
    op: z.literal("moveToHub"),
    ...moveToCategorySchema.shape,
  }),
  z.object({
    op: z.literal("reparent"),
    parentGoalId: z.string().min(1),
  }),
]);

export type GoalReorganizeBody = z.infer<typeof goalReorganizeBodySchema>;
