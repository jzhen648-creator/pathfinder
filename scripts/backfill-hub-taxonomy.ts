/**
 * Runs hub taxonomy sync for users whose hubTaxonomyVersion !== TAXONOMY_VERSION (or null).
 * Safe to re-run; current users are no-ops.
 *
 * Run from repo root: npm run backfill:hub-taxonomy
 */
import { PrismaClient } from "@prisma/client";
import { ensureHubTaxonomyCurrent } from "../src/lib/hub-taxonomy-sync";
import { TAXONOMY_VERSION } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, hubTaxonomyVersion: true },
  });

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    if (user.hubTaxonomyVersion === TAXONOMY_VERSION) {
      skipped += 1;
      continue;
    }

    try {
      const result = await ensureHubTaxonomyCurrent(prisma, user.id);
      if (result.skipped) {
        skipped += 1;
        console.log(`skip ${user.email} (already current after check)`);
      } else {
        synced += 1;
        console.log(`sync ${user.email} updates=${result.updates}`);
      }
    } catch (e) {
      errors += 1;
      console.error(`failed ${user.email}`, e);
    }
  }

  console.log(
    `Backfill complete (${TAXONOMY_VERSION}): synced=${synced} skipped=${skipped} errors=${errors} total=${users.length}`,
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
