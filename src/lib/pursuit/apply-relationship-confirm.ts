import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { pruneClarifierFromInsightCache } from "@/lib/pursuit/apply-clarifier-answers";
import { normalizeRelationshipPair } from "@/lib/pursuit/pursuit-context-log";
import { prisma } from "@/lib/prisma";

const POSITIVE_ANSWERS = new Set(["yes", "related", "connected", "they're connected"]);

function isPositiveRelationshipAnswer(option: string): boolean {
  const normalized = option.trim().toLowerCase();
  if (POSITIVE_ANSWERS.has(normalized)) return true;
  return !/(unrelated|not sure|no thanks|no)/i.test(option);
}

export async function applyRelationshipConfirmForUser(
  userId: string,
  goalId: string,
  input: { clarifierId: string; peerGoalId: string; selectedOption: string },
): Promise<{ confirmed: boolean }> {
  const peerGoalId = input.peerGoalId.trim();
  if (!peerGoalId || peerGoalId === goalId) {
    throw new Error("Invalid peer pursuit");
  }

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: [goalId, peerGoalId] }, archived: false },
    select: { id: true },
  });
  if (goals.length !== 2) {
    throw new Error("Not found");
  }

  const confirmed = isPositiveRelationshipAnswer(input.selectedOption);
  if (confirmed) {
    const [goalAId, goalBId] = normalizeRelationshipPair(goalId, peerGoalId);
    await prisma.pursuitRelationship.upsert({
      where: {
        userId_goalAId_goalBId: { userId, goalAId, goalBId },
      },
      create: {
        userId,
        goalAId,
        goalBId,
        sourceClarifierId: input.clarifierId,
      },
      update: {
        sourceClarifierId: input.clarifierId,
        confirmedAt: new Date(),
      },
    });
    await markPursuitReadingDirty(userId, goalId, "relationship_confirmed");
    await markPursuitReadingDirty(userId, peerGoalId, "relationship_confirmed");
  }

  await pruneClarifierFromInsightCache(userId, goalId, input.clarifierId);
  return { confirmed };
}
