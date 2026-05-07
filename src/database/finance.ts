/**
 * DATABASE — Finance
 *
 * Helper functions for finance-related goal records.
 */

import { prisma } from "@/lib/prisma";

export async function getFinanceGoalsForUser(userId: string) {
  return prisma.goal.findMany({
    where: { userId, lifeArea: { in: ["Money", "Money & Finance"] } },
    orderBy: { createdAt: "asc" },
  });
}

