import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

const driftMigrations = [
  "20260612180000_physical_taxonomy_rename_tail",
  "20260619120000_remove_abandoned_status",
  "20260621120000_drop_legacy_desktop_schema",
];

function fileChecksum(migrationName) {
  const sql = readFileSync(
    join("prisma/migrations", migrationName, "migration.sql"),
    "utf8",
  );
  return createHash("sha256").update(sql).digest("hex");
}

try {
  const constraints = await prisma.$queryRaw`
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = '"ThemeCategory"'::regclass
    ORDER BY conname
  `;
  console.log("ThemeCategory constraints:", JSON.stringify(constraints, null, 2));

  const rows = await prisma.$queryRaw`
    SELECT migration_name, checksum, finished_at IS NOT NULL AS applied
    FROM _prisma_migrations
    WHERE migration_name = ANY(${driftMigrations})
    ORDER BY migration_name
  `;
  console.log("\n_prisma_migrations rows:");
  for (const row of rows) {
    const local = fileChecksum(row.migration_name);
    console.log({
      name: row.migration_name,
      applied: row.applied,
      dbChecksum: row.checksum,
      fileChecksum: local,
      match: row.checksum === local,
    });
  }

  const currencyCols = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'UserManualProfile'
      AND column_name IN ('currencyCode', 'measurementSystem')
    ORDER BY column_name
  `;
  console.log("\nUserManualProfile currency columns:", currencyCols);

  const dupes = await prisma.$queryRaw`
    SELECT id, migration_name, checksum, finished_at, rolled_back_at, started_at
    FROM _prisma_migrations
    WHERE migration_name IN (
      '20260612180000_physical_taxonomy_rename_tail',
      '20260621120000_drop_legacy_desktop_schema',
      '20260619120000_remove_abandoned_status'
    )
    ORDER BY migration_name, finished_at NULLS FIRST
  `;
  console.log("\nAll drift-related migration rows:", JSON.stringify(dupes, null, 2));
} finally {
  await prisma.$disconnect();
}
