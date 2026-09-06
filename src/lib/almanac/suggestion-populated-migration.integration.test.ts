import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const LIFECYCLE_MIGRATION = "20260906010000_almanac_persistent_suggestions";
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;

function safeBaseUrl(): URL {
  if (!testDatabaseUrl || runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL.");
  }
  const url = new URL(testDatabaseUrl);
  const name = url.pathname.replace(/^\//u, "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) ||
    !name.startsWith("almanac_import_test")) {
    throw new Error("Refusing populated migration work outside a disposable database.");
  }
  return url;
}

function copyMigrations(destination: string, includeLifecycle: boolean): void {
  const source = resolve(process.cwd(), "prisma/migrations");
  mkdirSync(destination, { recursive: true });
  cpSync(join(source, "migration_lock.toml"), join(destination, "migration_lock.toml"));
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || (!includeLifecycle && entry.name === LIFECYCLE_MIGRATION)) continue;
    cpSync(join(source, entry.name), join(destination, entry.name), { recursive: true });
  }
}

function deploy(configPath: string, url: string): void {
  execFileSync(process.execPath, [
    resolve(process.cwd(), "node_modules/prisma/build/index.js"),
    "migrate", "deploy", "--config", configPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "pipe",
    timeout: 120_000,
  });
}

integrationSuite("persistent Suggestion populated forward migration — PostgreSQL", () => {
  beforeAll(async () => {
    safeBaseUrl();
    await prisma.$connect();
  });
  afterAll(async () => prisma.$disconnect());

  it("keeps populated legacy Updates and replaces uniqueness before enabling re-acceptance", async () => {
    const base = safeBaseUrl();
    const databaseName = `almanac_import_test_ps_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    if (!/^almanac_import_test_ps_[a-f0-9]+$/u.test(databaseName)) {
      throw new Error("Unsafe disposable database name.");
    }
    const isolatedUrl = new URL(base);
    isolatedUrl.pathname = `/${databaseName}`;
    const scratchRoot = resolve(process.cwd(), "tmp");
    mkdirSync(scratchRoot, { recursive: true });
    const scratch = mkdtempSync(join(scratchRoot, "suggestion-migration-"));
    const migrationCopy = join(scratch, "migrations");
    const configPath = join(scratch, "prisma.integration.config.ts");
    writeFileSync(configPath, [
      'import { defineConfig } from "prisma/config";',
      "export default defineConfig({",
      `schema: ${JSON.stringify(resolve(process.cwd(), "prisma/schema.prisma"))},`,
      `migrations: { path: ${JSON.stringify(migrationCopy)} },`,
      'datasource: { url: process.env["DATABASE_URL"]! },',
      "});",
    ].join("\n"), "utf8");

    let isolated: PrismaClient | null = null;
    let created = false;
    try {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      created = true;
      copyMigrations(migrationCopy, false);
      deploy(configPath, isolatedUrl.toString());
      isolated = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
      await isolated.user.create({ data: { id: "owner", email: "owner@migration.invalid" } });
      await isolated.almanacImport.create({
        data: {
          id: "legacy-import", userId: "owner", idempotencyKey: "legacy-source",
          scope: "CHAT", rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | Existing.",
          receipt: { version: 1, lines: [] },
        },
      });
      await isolated.almanacPlace.create({
        data: { id: "career", userId: "owner", name: "Career", normalisedName: "career", slot: 0 },
      });
      // The generated client already knows about suggestionApplicationId, while
      // this fixture deliberately represents the schema immediately before that
      // column exists. Raw SQL keeps the pre-migration seed historically honest.
      await isolated.$executeRawUnsafe(
        `INSERT INTO "AlmanacUpdate" (
          "id", "userId", "importId", "placeId", "state", "text",
          "normalisedFingerprint", "sourceLineNumber", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, 'NOW', $5, $6, $7, NOW(), NOW())`,
        "legacy-update", "owner", "legacy-import", "career", "Existing.",
        "NOW\u001fexisting.", 3,
      );
      await isolated.$disconnect();
      isolated = null;

      cpSync(
        resolve(process.cwd(), "prisma/migrations", LIFECYCLE_MIGRATION),
        join(migrationCopy, LIFECYCLE_MIGRATION),
        { recursive: true },
      );
      deploy(configPath, isolatedUrl.toString());
      isolated = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
      expect(await isolated.almanacUpdate.findUnique({ where: { id: "legacy-update" } }))
        .toMatchObject({ importId: "legacy-import", sourceLineNumber: 3 });
      await expect(isolated.almanacUpdate.create({
        data: {
          id: "duplicate-legacy", userId: "owner", importId: "legacy-import", placeId: "career",
          state: "NOW", text: "Duplicate.", normalisedFingerprint: "NOW\u001fduplicate.", sourceLineNumber: 3,
        },
      })).rejects.toThrow();

      await isolated.almanacImport.create({
        data: {
          id: "suggestion-import", userId: "owner", idempotencyKey: "suggestion-source",
          scope: "CHAT", rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | Proposed.",
          receipt: { version: 2, mode: "persistent_suggestions", lines: [] },
        },
      });
      await isolated.almanacSuggestion.create({
        data: {
          id: "suggestion", userId: "owner", importId: "suggestion-import", sourceLineNumber: 3,
          originalSubjectName: "Career", originalState: "NOW", originalText: "Proposed.",
          draftSubjectName: "Career", draftState: "NOW", draftText: "Proposed.", routedPlaceId: "career",
        },
      });
      await isolated.$transaction(async (tx) => {
        await tx.almanacSuggestionDecision.create({
          data: {
            id: "decision-1", userId: "owner", suggestionId: "suggestion",
            operationKey: "accept-operation-1", requestHash: "a".repeat(64), kind: "ACCEPT",
            expectedVersion: 1, resultVersion: 2, result: {},
          },
        });
        await tx.almanacSuggestionApplication.create({
          data: {
            id: "application-1", userId: "owner", suggestionId: "suggestion",
            decisionId: "decision-1", applicationSequence: 1,
          },
        });
        await tx.almanacUpdate.create({
          data: {
            id: "accepted-1", userId: "owner", importId: "suggestion-import", placeId: "career",
            state: "NOW", text: "Proposed.", normalisedFingerprint: "NOW\u001fproposed.",
            sourceLineNumber: 3, suggestionApplicationId: "application-1",
          },
        });
      });
      await isolated.almanacSuggestionApplication.update({
        where: { id_userId: { id: "application-1", userId: "owner" } },
        data: { revertedAt: new Date() },
      });
      await expect(isolated.$transaction(async (tx) => {
        await tx.almanacSuggestionDecision.create({
          data: {
            id: "orphan-decision", userId: "owner", suggestionId: "suggestion",
            operationKey: "orphan-operation-1", requestHash: "b".repeat(64), kind: "ACCEPT",
            expectedVersion: 2, resultVersion: 3, result: {},
          },
        });
        await tx.almanacSuggestionApplication.create({
          data: {
            id: "orphan-application", userId: "owner", suggestionId: "suggestion",
            decisionId: "orphan-decision", applicationSequence: 2,
          },
        });
      })).rejects.toThrow(/must produce exactly one Update/u);
    } finally {
      await isolated?.$disconnect();
      if (created) {
        await prisma.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}'`,
        );
        await prisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
      }
      const relativeScratch = relative(scratchRoot, resolve(scratch));
      if (!relativeScratch || relativeScratch.startsWith("..") || isAbsolute(relativeScratch)) {
        throw new Error("Refusing to remove an unexpected migration scratch path.");
      }
      rmSync(resolve(scratch), { recursive: true, force: true });
    }
  }, 180_000);
});
