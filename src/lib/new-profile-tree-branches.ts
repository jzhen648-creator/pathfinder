import type { PrismaClient } from "@prisma/client";
import { LOCKED_HUB_TEMPLATES } from "@/lib/taxonomy";
import { ensureSystemHubsForUser } from "@/lib/system-hubs";

/** @deprecated Import `LOCKED_HUB_TEMPLATES` from `@/lib/taxonomy`. */
export const NEW_PROFILE_ROOT_BRANCH_TEMPLATES = LOCKED_HUB_TEMPLATES;

/** Ensures all 17 system hubs exist (dormant until limbs are activated). */
export async function ensureNewProfileBranches(prisma: PrismaClient, userId: string): Promise<void> {
  await ensureSystemHubsForUser(prisma, userId);
}
