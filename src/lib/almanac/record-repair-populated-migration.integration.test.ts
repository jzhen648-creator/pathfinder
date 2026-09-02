import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const FOUNDATION_MIGRATION = "20260902120000_almanac_record_repair_foundation";
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;

function assertSafeIntegrationDatabase(): URL {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//u, "");
  const loopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!loopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run populated migration test outside the isolated local database.");
  }
  return parsedUrl;
}

function copyMigrations(destination: string, includeFoundation: boolean): void {
  const source = resolve(process.cwd(), "prisma/migrations");
  mkdirSync(destination, { recursive: true });
  cpSync(join(source, "migration_lock.toml"), join(destination, "migration_lock.toml"));
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === FOUNDATION_MIGRATION && !includeFoundation) continue;
    cpSync(join(source, entry.name), join(destination, entry.name), { recursive: true });
  }
}

function deployMigrations(configPath: string, databaseUrl: string): void {
  execFileSync(
    process.execPath,
    [
      resolve(process.cwd(), "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--config",
      configPath,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      stdio: "pipe",
      timeout: 120_000,
    },
  );
}

integrationSuite("record-repair populated forward migration — PostgreSQL", () => {
  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("backfills a deployed cross-Place singular edge before enabling new-edge integrity", async () => {
    const baseUrl = assertSafeIntegrationDatabase();
    const isolatedDatabaseName = `almanac_import_test_rr_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    if (!/^almanac_import_test_rr_[a-f0-9]+$/u.test(isolatedDatabaseName)) {
      throw new Error("Unsafe isolated database name.");
    }
    const isolatedUrl = new URL(baseUrl);
    isolatedUrl.pathname = `/${isolatedDatabaseName}`;

    const scratchRoot = resolve(process.cwd(), "tmp");
    mkdirSync(scratchRoot, { recursive: true });
    const scratch = mkdtempSync(join(scratchRoot, "record-repair-migration-"));
    const migrationCopy = join(scratch, "migrations");
    const configPath = join(scratch, "prisma.integration.config.ts");
    writeFileSync(
      configPath,
      [
        'import { defineConfig } from "prisma/config";',
        "export default defineConfig({",
        `  schema: ${JSON.stringify(resolve(process.cwd(), "prisma/schema.prisma"))},`,
        `  migrations: { path: ${JSON.stringify(migrationCopy)} },`,
        '  datasource: { url: process.env["DATABASE_URL"]! },',
        "});",
      ].join("\n"),
      "utf8",
    );

    let isolated: PrismaClient | null = null;
    let databaseCreated = false;
    try {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${isolatedDatabaseName}"`);
      databaseCreated = true;
      copyMigrations(migrationCopy, false);
      deployMigrations(configPath, isolatedUrl.toString());

      isolated = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
      const userId = "populated-migration-user";
      const sourcePlaceId = "populated-source-place";
      const targetPlaceId = "populated-target-place";
      const predecessorId = "populated-predecessor";
      const successorId = "populated-successor";
      await isolated.user.create({
        data: {
          id: userId,
          email: "populated-migration@almanac-dogfood.integration.invalid",
          isAnonymous: false,
        },
        select: { id: true },
      });
      await isolated.almanacImport.createMany({
        data: [
          {
            id: "populated-import-a",
            userId,
            idempotencyKey: "populated-migration-a",
            protocolVersion: "ALMANAC/1",
            scope: "CHAT",
            rawPacket: "ALMANAC/1\nscope: chat\nOld studio | NOW | Sessions happen monthly.",
            receipt: { version: 1, lines: [] },
          },
          {
            id: "populated-import-b",
            userId,
            idempotencyKey: "populated-migration-b",
            protocolVersion: "ALMANAC/1",
            scope: "CHAT",
            rawPacket: "ALMANAC/1\nscope: chat\nNew studio | NOW | Sessions happen weekly.",
            receipt: { version: 1, lines: [] },
          },
        ],
      });
      await isolated.almanacPlace.createMany({
        data: [
          {
            id: sourcePlaceId,
            userId,
            name: "Old studio",
            normalisedName: "old studio",
            slot: 0,
          },
          {
            id: targetPlaceId,
            userId,
            name: "New studio",
            normalisedName: "new studio",
            slot: 1,
          },
        ],
      });
      await isolated.almanacUpdate.create({
        data: {
          id: predecessorId,
          userId,
          importId: "populated-import-a",
          placeId: sourcePlaceId,
          state: "NOW",
          text: "Sessions happen monthly.",
          normalisedFingerprint: "NOW\u001fsessions happen monthly.",
          sourceLineNumber: 3,
        },
        select: { id: true },
      });
      await isolated.almanacSubjectPreference.create({
        data: { placeId: sourcePlaceId, userId, mergedIntoPlaceId: targetPlaceId },
        select: { placeId: true },
      });
      await isolated.almanacUpdate.create({
        data: {
          id: successorId,
          userId,
          importId: "populated-import-b",
          placeId: targetPlaceId,
          state: "NOW",
          text: "Sessions happen weekly.",
          normalisedFingerprint: "NOW\u001fsessions happen weekly.",
          sourceLineNumber: 3,
          supersedesUpdateId: predecessorId,
        },
        select: { id: true },
      });
      await isolated.almanacSubjectPreference.update({
        where: { placeId: sourcePlaceId },
        data: { mergedIntoPlaceId: null },
        select: { placeId: true },
      });
      await isolated.$disconnect();
      isolated = null;

      cpSync(
        resolve(process.cwd(), "prisma/migrations", FOUNDATION_MIGRATION),
        join(migrationCopy, FOUNDATION_MIGRATION),
        { recursive: true },
      );
      deployMigrations(configPath, isolatedUrl.toString());

      isolated = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
      const edges = await isolated.$queryRawUnsafe<
        Array<{ successorUpdateId: string; predecessorUpdateId: string; userId: string }>
      >(
        'SELECT "successorUpdateId", "predecessorUpdateId", "userId" FROM "AlmanacUpdateSupersession"',
      );
      expect(edges).toEqual([
        { successorUpdateId: successorId, predecessorUpdateId: predecessorId, userId },
      ]);
      expect(
        await isolated.almanacSubjectPreference.findUnique({
          where: { placeId: sourcePlaceId },
          select: { mergedIntoPlaceId: true },
        }),
      ).toEqual({ mergedIntoPlaceId: null });

      const freshSourceUpdateId = "populated-fresh-source";
      const freshTargetUpdateId = "populated-fresh-target";
      await isolated.almanacUpdate.createMany({
        data: [
          {
            id: freshSourceUpdateId,
            userId,
            importId: "populated-import-a",
            placeId: sourcePlaceId,
            state: "NOW",
            text: "Fresh source statement.",
            normalisedFingerprint: "NOW\u001ffresh source statement.",
            sourceLineNumber: 4,
          },
          {
            id: freshTargetUpdateId,
            userId,
            importId: "populated-import-b",
            placeId: targetPlaceId,
            state: "NOW",
            text: "Fresh target statement.",
            normalisedFingerprint: "NOW\u001ffresh target statement.",
            sourceLineNumber: 4,
          },
        ],
      });
      await expect(
        isolated.$executeRawUnsafe(
          'INSERT INTO "AlmanacUpdateSupersession" ("successorUpdateId", "predecessorUpdateId", "userId") VALUES ($1, $2, $3)',
          freshTargetUpdateId,
          freshSourceUpdateId,
          userId,
        ),
      ).rejects.toThrow(/cannot cross Subjects/u);

      const migrationSql = readFileSync(
        resolve(process.cwd(), "prisma/migrations", FOUNDATION_MIGRATION, "migration.sql"),
        "utf8",
      );
      expect(migrationSql.indexOf('INSERT INTO "AlmanacUpdateSupersession"')).toBeLessThan(
        migrationSql.indexOf('CREATE TRIGGER "AlmanacUpdateSupersession_integrity"'),
      );
    } finally {
      await isolated?.$disconnect();
      if (databaseCreated) {
        await prisma.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${isolatedDatabaseName}'`,
        );
        await prisma.$executeRawUnsafe(`DROP DATABASE "${isolatedDatabaseName}"`);
      }
      const resolvedScratch = resolve(scratch);
      const relativeScratch = relative(scratchRoot, resolvedScratch);
      if (!relativeScratch || relativeScratch.startsWith("..") || isAbsolute(relativeScratch)) {
        throw new Error("Refusing to remove an unexpected migration scratch path.");
      }
      rmSync(resolvedScratch, { recursive: true, force: true });
    }
  }, 180_000);
});
