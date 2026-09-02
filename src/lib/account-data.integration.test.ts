import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AccountPasswordError,
  deleteAccountForUser,
  eraseAlmanacForUser,
} from "@/lib/account-data";
import { commitAlmanacImport } from "@/lib/almanac/service";
import { prisma } from "@/lib/prisma";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@account-data.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsed = new URL(testDatabaseUrl);
  const databaseName = parsed.pathname.replace(/^\//u, "");
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!loopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run account erasure outside the isolated local database.");
  }
}

async function createRichAccount(label: string): Promise<{ userId: string; password: string }> {
  const password = "correct horse battery staple";
  const user = await prisma.user.create({
    data: {
      email: `${label}-${crypto.randomUUID()}${testEmailDomain}`,
      name: "Test person",
      passwordHash: await bcrypt.hash(password, 4),
      isAnonymous: false,
      betaUsageEvents: { create: { name: "auth.login" } },
    },
    select: { id: true },
  });
  const earlierUpdateId = crypto.randomUUID();
  const latestUpdateId = crypto.randomUUID();
  const careerPlaceId = crypto.randomUUID();
  const firstImport = await prisma.almanacImport.create({
    data: {
      userId: user.id,
      idempotencyKey: `${label}-one-${crypto.randomUUID()}`,
      scope: "CHAT",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | OPEN | Consider role A.",
      receipt: { version: 1, lines: [] },
    },
  });
  const secondImport = await prisma.almanacImport.create({
    data: {
      userId: user.id,
      idempotencyKey: `${label}-two-${crypto.randomUUID()}`,
      scope: "CHAT",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | OPEN | Consider role B.",
      receipt: { version: 1, lines: [] },
    },
  });
  const directImport = await prisma.almanacImport.create({
    data: {
      userId: user.id,
      idempotencyKey: `${label}-direct-${crypto.randomUUID()}`,
      protocolVersion: "ALMANAC/USER/1",
      scope: "DIRECT",
      rawPacket: "ALMANAC/USER/1\naction: resolution\nApply to the chosen role.",
      receipt: {
        version: 1,
        lines: [{ lineNumber: 3, outcome: "accepted", reason: "user_resolution" }],
        counts: {
          accepted: 1,
          rejected: 0,
          newPlaces: 0,
          duplicates: 0,
          invalid: 0,
        },
        directRequest: {
          subjectId: careerPlaceId,
          action: "resolution",
          state: "NEXT",
          statement: "Apply to the chosen role.",
          supersedesUpdateIds: [earlierUpdateId, latestUpdateId].sort(),
          curation: {
            significance: "KEY",
            targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
          },
        },
      },
    },
  });
  const career = await prisma.almanacPlace.create({
    data: {
      id: careerPlaceId,
      userId: user.id,
      name: "Career",
      normalisedName: "career",
      slot: 0,
    },
  });
  const finance = await prisma.almanacPlace.create({
    data: { userId: user.id, name: "Finances", normalisedName: "finances", slot: 1 },
  });
  const earlier = await prisma.almanacUpdate.create({
    data: {
      id: earlierUpdateId,
      userId: user.id,
      importId: firstImport.id,
      placeId: career.id,
      state: "OPEN",
      text: "Consider role A.",
      normalisedFingerprint: "OPEN\u001fconsider role a.",
      sourceLineNumber: 3,
    },
  });
  const latest = await prisma.almanacUpdate.create({
    data: {
      id: latestUpdateId,
      userId: user.id,
      importId: secondImport.id,
      placeId: career.id,
      state: "OPEN",
      text: "Consider role B.",
      normalisedFingerprint: "OPEN\u001fconsider role b.",
      sourceLineNumber: 3,
    },
  });
  const direct = await prisma.almanacUpdate.create({
    data: {
      userId: user.id,
      importId: directImport.id,
      placeId: career.id,
      state: "NEXT",
      text: "Apply to the chosen role.",
      normalisedFingerprint: "NEXT\u001fapply to the chosen role.",
      sourceLineNumber: 3,
    },
  });
  await prisma.almanacUpdateSupersession.createMany({
    data: [earlier.id, latest.id].map((predecessorUpdateId) => ({
      userId: user.id,
      successorUpdateId: direct.id,
      predecessorUpdateId,
    })),
  });
  await prisma.almanacSubjectPreference.create({
    data: { placeId: finance.id, userId: user.id, mergedIntoPlaceId: career.id },
  });
  await prisma.almanacUpdatePreference.create({
    data: {
      updateId: direct.id,
      userId: user.id,
      hiddenAt: new Date(),
      significance: "KEY",
      targetDate: new Date("2027-03-01T00:00:00.000Z"),
      targetDatePrecision: "MONTH",
    },
  });
  return { userId: user.id, password };
}

async function currentAlmanacCount(userId: string): Promise<number> {
  const counts = await Promise.all([
    prisma.almanacImport.count({ where: { userId } }),
    prisma.almanacPlace.count({ where: { userId } }),
    prisma.almanacUpdate.count({ where: { userId } }),
    prisma.almanacUpdateSupersession.count({ where: { userId } }),
    prisma.almanacSubjectPreference.count({ where: { userId } }),
    prisma.almanacUpdatePreference.count({ where: { userId } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

integrationSuite("account and Almanac erasure — PostgreSQL", () => {
  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    await prisma.$connect();
  });
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("completely erases current Almanac data while retaining login and unrelated account data", async () => {
    const account = await createRichAccount("erase");
    const otherAccount = await createRichAccount("erase-other-owner");
    expect(await currentAlmanacCount(account.userId)).toBeGreaterThan(0);
    const otherOwnerCount = await currentAlmanacCount(otherAccount.userId);
    expect(await prisma.almanacImport.findFirst({
      where: { userId: account.userId, scope: "DIRECT", protocolVersion: "ALMANAC/USER/1" },
    })).not.toBeNull();
    expect(await prisma.almanacUpdateSupersession.count({
      where: { userId: account.userId },
    })).toBe(2);
    expect(await prisma.almanacUpdatePreference.findFirst({
      where: { userId: account.userId },
    })).toMatchObject({
      significance: "KEY",
      targetDatePrecision: "MONTH",
      targetDate: new Date("2027-03-01T00:00:00.000Z"),
    });

    await eraseAlmanacForUser(account.userId);

    expect(await currentAlmanacCount(account.userId)).toBe(0);
    expect(await currentAlmanacCount(otherAccount.userId)).toBe(otherOwnerCount);
    expect(await prisma.almanacImport.count({
      where: { userId: otherAccount.userId, scope: "DIRECT" },
    })).toBe(1);
    expect(await prisma.almanacUpdateSupersession.count({
      where: { userId: otherAccount.userId },
    })).toBe(2);
    expect(await prisma.user.findUnique({ where: { id: account.userId } })).not.toBeNull();
    expect(await prisma.betaUsageEvent.count({ where: { userId: account.userId } })).toBe(1);
  });

  it("serialises erasure behind an in-flight Almanac write so no interleaved data survives", async () => {
    const account = await createRichAccount("erase-concurrent-write");
    let markWritePaused!: () => void;
    let releaseWrite!: () => void;
    let markEraseLocked!: () => void;
    const writePaused = new Promise<void>((resolve) => { markWritePaused = resolve; });
    const writeRelease = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const eraseLocked = new Promise<void>((resolve) => { markEraseLocked = resolve; });

    const write = commitAlmanacImport(
      account.userId,
      {
        idempotencyKey: `erase-race-${crypto.randomUUID()}`,
        rawPacket: [
          "ALMANAC/1",
          "scope: chat",
          "Concurrent subject | NOW | This write started before erasure.",
        ].join("\n"),
        decisions: [{ lineNumber: 3, accepted: true }],
      },
      {
        afterPlacesResolved: async () => {
          markWritePaused();
          await writeRelease;
        },
      },
    );
    await writePaused;

    const erase = eraseAlmanacForUser(account.userId, {
      afterOwnerLocked: () => { markEraseLocked(); },
    });
    const lockState = await Promise.race([
      eraseLocked.then(() => "acquired" as const),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]);
    releaseWrite();
    expect(lockState).toBe("blocked");
    await write;
    await erase;

    expect(await currentAlmanacCount(account.userId)).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: account.userId } })).not.toBeNull();
  });

  it("requires the password, then deletes the account through NoAction and cascade relations", async () => {
    const account = await createRichAccount("delete");
    await expect(deleteAccountForUser(account.userId, "wrong password")).rejects.toBeInstanceOf(
      AccountPasswordError,
    );
    expect(await prisma.user.findUnique({ where: { id: account.userId } })).not.toBeNull();

    await deleteAccountForUser(account.userId, account.password);

    expect(await prisma.user.findUnique({ where: { id: account.userId } })).toBeNull();
    expect(await currentAlmanacCount(account.userId)).toBe(0);
    expect(await prisma.betaUsageEvent.count({ where: { userId: account.userId } })).toBe(0);
  });
});
