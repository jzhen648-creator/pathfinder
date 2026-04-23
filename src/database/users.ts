/**
 * DATABASE — Users
 *
 * Helper functions for reading user records.
 */

import { prisma } from "@/lib/prisma";

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

