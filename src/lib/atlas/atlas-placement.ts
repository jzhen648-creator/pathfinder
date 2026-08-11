import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ATLAS_SLOT_LIMIT = 64;

/**
 * Fixed authored order: early Chapters are deliberately dispersed across the
 * illustration. Coordinates live in the mobile renderer; the API stores only
 * these non-semantic slot identifiers.
 */
export const ATLAS_DISPERSION_ORDER = [
  0, 8, 14, 21, 29, 37, 42, 51, 53, 57, 60, 63, 3, 18, 27, 35,
  44, 46, 55, 61, 5, 11, 17, 23, 31, 39, 48, 52, 58, 2, 7, 13,
  20, 26, 32, 40, 47, 54, 62, 10, 1, 4, 6, 9, 12, 15, 16, 19,
  22, 24, 25, 28, 30, 33, 34, 36, 38, 41, 43, 45, 49, 50, 56, 59,
] as const;

type GoalForPlacement = { id: string; createdAt: Date };
type ExistingPlacement = { goalId: string; slot: number };

export function planAtlasPlacements(
  goals: readonly GoalForPlacement[],
  existing: readonly ExistingPlacement[],
) {
  const existingGoalIds = new Set(existing.map((placement) => placement.goalId));
  const occupiedSlots = new Set(existing.map((placement) => placement.slot));
  const availableSlots = ATLAS_DISPERSION_ORDER.filter((slot) => !occupiedSlots.has(slot));
  const missing = goals
    .filter((goal) => !existingGoalIds.has(goal.id))
    .sort((left, right) => {
      const byCreated = left.createdAt.getTime() - right.createdAt.getTime();
      return byCreated || left.id.localeCompare(right.id);
    });

  return {
    create: missing.slice(0, availableSlots.length).map((goal, index) => ({
      goalId: goal.id,
      slot: availableSlots[index]!,
    })),
    overflowGoalIds: missing.slice(availableSlots.length).map((goal) => goal.id),
  };
}

type TransactionClient = Prisma.TransactionClient;
const TRANSACTION_ATTEMPTS = 3;

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

export async function runAtlasSerializable<T>(
  work: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      const retryable = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!retryable || attempt === TRANSACTION_ATTEMPTS) throw error;
    }
  }
  throw new Error("Atlas placement transaction retry loop exited unexpectedly");
}

export async function ensureAtlasPlacements(
  transaction: TransactionClient,
  userId: string,
) {
  const [goals, existing] = await Promise.all([
    transaction.goal.findMany({
      where: { userId, archived: false },
      select: { id: true, createdAt: true },
    }),
    transaction.atlasPlacement.findMany({
      where: { userId },
      select: { goalId: true, slot: true },
    }),
  ]);
  const plan = planAtlasPlacements(goals, existing);
  if (plan.create.length) {
    await transaction.atlasPlacement.createMany({
      data: plan.create.map((placement) => ({ ...placement, userId })),
    });
  }
  return plan;
}
