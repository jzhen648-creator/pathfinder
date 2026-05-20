import { PrismaClient } from "@prisma/client";
import { hasStreamSessionDelegate } from "@/lib/prisma-stream-session";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

/**
 * Reuse the dev singleton only when it matches the current schema (e.g. StreamSession).
 * After `prisma generate` + a new model, an old `global.prisma` lacks delegates and throws
 * "Cannot read properties of undefined (reading 'findMany')".
 */
function getPrismaClient(): PrismaClient {
  const cached = global.prisma;
  if (cached && hasStreamSessionDelegate(cached)) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    global.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
