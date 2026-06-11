import { PrismaClient } from "@prisma/client";
import { seedAllTreeTestProfiles } from "../src/lib/tree-test-profiles-seed";

/**
 * Empty-canvas dev account: mygoals@pathfinder.test / password123
 * @see src/lib/tree-test-profiles-seed.ts
 */
const prisma = new PrismaClient();

seedAllTreeTestProfiles(prisma)
  .catch((error) => {
    console.error("Tree test seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
