/**
 * DATABASE — Nodes
 *
 * Helper functions for reading and writing life map nodes.
 */

import type { Mark } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getMarksForUser(userId: string): Promise<Mark[]> {
  return prisma.mark.findMany({
    where: { userId },
    orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
  });
}
