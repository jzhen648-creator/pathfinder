/**
 * Run onboarding completion for the newest incomplete user.
 * Run: npx tsx scripts/test-onboarding-route.ts
 */
import { PrismaClient } from "@prisma/client";
import { completeOnboardingForUser } from "../src/lib/complete-onboarding";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { onboardingCompleted: false },
    orderBy: { createdAt: "desc" },
  });
  if (!user) {
    console.error("No user with onboardingCompleted=false");
    process.exitCode = 1;
    return;
  }

  console.log("User:", user.email);
  await completeOnboardingForUser(prisma, user.id, {
    name: "Route Test",
    activeLimbIds: ["work", "finance"],
  });
  console.log("OK");

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingCompleted: false, name: user.name },
  });
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
