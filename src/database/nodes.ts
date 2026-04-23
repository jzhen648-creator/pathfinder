/**
 * DATABASE — Nodes
 *
 * Helper functions for reading and writing life map nodes.
 */

import { prisma } from "@/lib/prisma";

export async function getLifeMapNodesForUser(userId: string) {
  return prisma.moment.findMany({
    where: { userId },
    orderBy: { year: "asc" },
  });
}

