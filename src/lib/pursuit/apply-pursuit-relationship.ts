import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { normalizeRelationshipPair } from "@/lib/pursuit/pursuit-context-log";
import { prisma } from "@/lib/prisma";

const MAX_LABEL_LENGTH = 80;

function normalizeLabel(raw?: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}

export async function createPursuitRelationshipForUser(
  userId: string,
  goalId: string,
  input: { peerGoalId: string; label?: string | null },
): Promise<{ relationshipId: string }> {
  const peerGoalId = input.peerGoalId.trim();
  if (!peerGoalId || peerGoalId === goalId) {
    throw new Error("Invalid peer pursuit");
  }

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: [goalId, peerGoalId] }, archived: false },
    select: { id: true },
  });
  const foundIds = new Set(goals.map((goal) => goal.id));
  if (!foundIds.has(goalId)) {
    throw new Error("Source pursuit not found");
  }
  if (!foundIds.has(peerGoalId)) {
    throw new Error("Target pursuit not found");
  }

  const [goalAId, goalBId] = normalizeRelationshipPair(goalId, peerGoalId);
  const label = normalizeLabel(input.label);

  const row = await prisma.pursuitRelationship.upsert({
    where: {
      userId_goalAId_goalBId: { userId, goalAId, goalBId },
    },
    create: {
      userId,
      goalAId,
      goalBId,
      label,
    },
    update: {
      label,
      confirmedAt: new Date(),
    },
    select: { id: true },
  });

  await markPursuitReadingDirty(userId, goalId, "relationship_created");
  await markPursuitReadingDirty(userId, peerGoalId, "relationship_created");

  return { relationshipId: row.id };
}

export async function deletePursuitRelationshipForUser(
  userId: string,
  goalId: string,
  peerGoalId: string,
): Promise<{ deleted: boolean }> {
  const peer = peerGoalId.trim();
  if (!peer || peer === goalId) {
    throw new Error("Invalid peer pursuit");
  }

  const [goalAId, goalBId] = normalizeRelationshipPair(goalId, peer);
  const existing = await prisma.pursuitRelationship.findUnique({
    where: {
      userId_goalAId_goalBId: { userId, goalAId, goalBId },
    },
    select: { id: true },
  });
  if (!existing) {
    return { deleted: false };
  }

  await prisma.pursuitRelationship.delete({ where: { id: existing.id } });
  await markPursuitReadingDirty(userId, goalId, "relationship_removed");
  await markPursuitReadingDirty(userId, peer, "relationship_removed");

  return { deleted: true };
}
