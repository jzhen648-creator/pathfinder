/**
 * Removes legacy tree dev accounts (no longer seeded). Run from repo root:
 *   npx tsx scripts/delete-tree-demo-personas.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const emails = ["alex@pathfinder.test", "jordan@pathfinder.test"] as const;

async function main() {
  const deleted = await prisma.user.deleteMany({
    where: { email: { in: [...emails] } },
  });
  console.log(`Deleted ${deleted.count} user row(s) for: ${emails.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
