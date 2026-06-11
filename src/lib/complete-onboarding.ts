import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import { activateLimbsForUser } from "@/lib/system-categories";

export type CompleteOnboardingInput = {
  name: string;
  activeLimbIds: readonly LifeAreaId[];
};

/** Name + hub setup + mark onboarding done. Hub steps run before the user flag is set. */
export async function completeOnboardingForUser(
  prisma: PrismaClient,
  userId: string,
  input: CompleteOnboardingInput,
): Promise<void> {
  const preferredName = input.name.trim();

  await ensureTaxonomyCurrent(prisma, userId);
  await activateLimbsForUser(prisma, userId, input.activeLimbIds);

  const primaryLimbId = input.activeLimbIds[0] ?? null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: preferredName,
      onboardingCompleted: true,
      onboardingPrimaryLimbId: primaryLimbId,
      onboardingScene: null,
      onboardingThemeId: null,
      onboardingHubSlug: null,
    },
  });
}
