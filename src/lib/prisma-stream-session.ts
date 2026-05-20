import type { PrismaClient } from "@prisma/client";

type StreamSessionDelegate = PrismaClient["streamSession"];

/** True when the generated client includes StreamSession (post-migration). */
export function hasStreamSessionDelegate(prisma: PrismaClient): prisma is PrismaClient & {
  streamSession: StreamSessionDelegate;
} {
  const delegate = (prisma as PrismaClient & { streamSession?: StreamSessionDelegate }).streamSession;
  return typeof delegate?.findMany === "function";
}

export function getStreamSessionDelegate(prisma: PrismaClient): StreamSessionDelegate | null {
  return hasStreamSessionDelegate(prisma) ? prisma.streamSession : null;
}
