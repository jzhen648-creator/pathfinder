/**
 * One-time repair for Supabase _prisma_migrations drift.
 *
 * Fixes:
 * 1. Removes rolled-back duplicate rows (failed first attempts with stale checksums).
 * 2. Updates remove_abandoned_status checksum to match the committed migration file.
 *
 * Run: node scripts/repair-prisma-migration-history.mjs
 * Then: npx prisma migrate deploy
 */
import { config } from "dotenv";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

function fileChecksum(migrationName) {
  const sql = readFileSync(
    join("prisma/migrations", migrationName, "migration.sql"),
    "utf8",
  );
  return createHash("sha256").update(sql).digest("hex");
}

try {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "_prisma_migrations"
    WHERE "finished_at" IS NULL
      AND "rolled_back_at" IS NOT NULL
  `;
  console.log(`Deleted ${deleted} rolled-back migration row(s).`);

  const removeAbandonedChecksum = fileChecksum(
    "20260619120000_remove_abandoned_status",
  );
  const updated = await prisma.$executeRaw`
    UPDATE "_prisma_migrations"
    SET "checksum" = ${removeAbandonedChecksum}
    WHERE "migration_name" = '20260619120000_remove_abandoned_status'
      AND "finished_at" IS NOT NULL
  `;
  console.log(
    `Updated remove_abandoned_status checksum on ${updated} row(s) -> ${removeAbandonedChecksum}`,
  );

  const reconcileChecksum = fileChecksum("20260704190000_reconcile_prod_drift");
  const reconcileUpdated = await prisma.$executeRaw`
    UPDATE "_prisma_migrations"
    SET "checksum" = ${reconcileChecksum}
    WHERE "migration_name" = '20260704190000_reconcile_prod_drift'
      AND "finished_at" IS NOT NULL
  `;
  console.log(
    `Updated reconcile_prod_drift checksum on ${reconcileUpdated} row(s) -> ${reconcileChecksum}`,
  );

  const remaining = await prisma.$queryRaw`
    SELECT migration_name, checksum, finished_at IS NOT NULL AS applied
    FROM "_prisma_migrations"
    WHERE migration_name IN (
      '20260612180000_physical_taxonomy_rename_tail',
      '20260619120000_remove_abandoned_status',
      '20260621120000_drop_legacy_desktop_schema'
    )
    ORDER BY migration_name
  `;
  console.log("\nRemaining drift-related rows:", remaining);
} finally {
  await prisma.$disconnect();
}
