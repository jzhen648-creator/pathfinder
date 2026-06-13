import type { Prisma } from "@prisma/client";

/** Pursuits that count toward live map interpretation (Reading, Insight, mapVersion). */
export const interpretationEligiblePursuitWhere = {
  archived: false,
  status: { not: "ABANDONED" as const },
  goalType: { notIn: ["moment", "event"] as const },
} satisfies Prisma.GoalWhereInput;

export const interpretationEligibleMilestoneWhere = {
  goal: interpretationEligiblePursuitWhere,
} satisfies Prisma.MilestoneWhereInput;
