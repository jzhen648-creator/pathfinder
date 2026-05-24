import type { PrismaClient } from "@prisma/client";

type StreamSessionDelegate = PrismaClient["streamSession"];
type ProfileFactDelegate = PrismaClient["profileFact"];

/** True when the generated client includes delegates added by recent migrations. */
export function hasStreamSessionDelegate(prisma: PrismaClient): prisma is PrismaClient & {
  streamSession: StreamSessionDelegate;
  profileFact: ProfileFactDelegate;
} {
  const client = prisma as PrismaClient & {
    streamSession?: StreamSessionDelegate;
    profileFact?: ProfileFactDelegate;
  };
  return (
    typeof client.streamSession?.findMany === "function" &&
    typeof client.profileFact?.findMany === "function"
  );
}

export function getStreamSessionDelegate(prisma: PrismaClient): StreamSessionDelegate | null {
  return hasStreamSessionDelegate(prisma) ? prisma.streamSession : null;
}
