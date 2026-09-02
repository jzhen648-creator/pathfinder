import { Prisma } from "@prisma/client";

/** Serialises every Almanac mutation for one owner without blocking other owners. */
export async function lockAlmanacOwner(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))::text AS locked
  `;
}
