/**
 * Runs hub taxonomy sync for users whose taxonomyVersion !== TAXONOMY_VERSION (or null).
 * Safe to re-run; current users are no-ops.
 *
 * Run from repo root: npm run backfill:hub-taxonomy
 */
import { PrismaClient } from "@prisma/client";
import { dedupeDuplicateRootCategories } from "../src/lib/hub-dedupe";
import { ensureTaxonomyCurrent } from "../src/lib/hub-taxonomy-sync";
import { TAXONOMY_VERSION } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, taxonomyVersion: true },
  });

  let synced = 0;
  let deduped = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      if (user.taxonomyVersion !== TAXONOMY_VERSION) {
        const result = await ensureTaxonomyCurrent(prisma, user.id);
        if (result.skipped) {
          skipped += 1;
          console.log(`skip ${user.email} (already current after check)`);
        } else {
          synced += 1;
          console.log(`sync ${user.email} updates=${result.updates}`);
        }
      } else {
        const merges = await dedupeDuplicateRootCategories(prisma, user.id);
        if (merges > 0) {
          deduped += 1;
          console.log(`dedupe ${user.email} merges=${merges}`);
        } else {
          skipped += 1;
        }
      }
    } catch (e) {
      errors += 1;
      console.error(`failed ${user.email}`, e);
    }
  }

  console.log(
    `Backfill complete (${TAXONOMY_VERSION}): synced=${synced} deduped=${deduped} skipped=${skipped} errors=${errors} total=${users.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
