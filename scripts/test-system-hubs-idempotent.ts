/**
 * Minimal idempotency check: ensureSystemCategoriesForUser twice => 17 system hubs, no duplicates.
 * Run: npx tsx scripts/test-system-hubs-idempotent.ts
 */
import { PrismaClient } from "@prisma/client";
import { ensureSystemCategoriesForUser, listSystemHubKeysForUser } from "../src/lib/system-categories";
import { LOCKED_CATEGORY_TEMPLATES } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("No users in database — create one first.");
    process.exitCode = 1;
    return;
  }

  const first = await ensureSystemCategoriesForUser(prisma, user.id);
  const second = await ensureSystemCategoriesForUser(prisma, user.id);
  const keys = await listSystemHubKeysForUser(prisma, user.id);
  const count = await prisma.themeCategory.count({
    where: { userId: user.id, isSystemCategory: true, parentCategoryId: null },
  });

  console.log(`User: ${user.email}`);
  console.log(`Created on 1st call: ${first}`);
  console.log(`Created on 2nd call: ${second} (expect 0)`);
  console.log(`System hub rows: ${count} (expect ${LOCKED_CATEGORY_TEMPLATES.length})`);
  console.log(`Unique keys: ${keys.length}`);

  if (second !== 0 || count !== LOCKED_CATEGORY_TEMPLATES.length || keys.length !== LOCKED_CATEGORY_TEMPLATES.length) {
    process.exitCode = 1;
    console.error("FAIL");
    return;
  }
  console.log("PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
