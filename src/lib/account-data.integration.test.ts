import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AccountPasswordError,
  deleteAccountForUser,
  eraseAlmanacForUser,
} from "@/lib/account-data";
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
  const firstImport = await prisma.almanacImport.create({
    data: {
      userId: user.id,
      idempotencyKey: `${label}-one-${crypto.randomUUID()}`,
      scope: "CHAT",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | Seeking a role.",
      receipt: { version: 1, lines: [] },
    },
  });
  const secondImport = await prisma.almanacImport.create({
    data: {
      userId: user.id,
      idempotencyKey: `${label}-two-${crypto.randomUUID()}`,
      scope: "CHAT",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | Accepted a role.",
      receipt: { version: 1, lines: [] },
    },
  });
  const career = await prisma.almanacPlace.create({
    data: { userId: user.id, name: "Career", normalisedName: "career", slot: 0 },
  });
  const finance = await prisma.almanacPlace.create({
    data: { userId: user.id, name: "Finances", normalisedName: "finances", slot: 1 },
  });
  const earlier = await prisma.almanacUpdate.create({
    data: {
      userId: user.id,
      importId: firstImport.id,
      placeId: career.id,
      state: "NOW",
      text: "Seeking a role.",
      normalisedFingerprint: "seeking a role",
      sourceLineNumber: 3,
    },
  });
  const latest = await prisma.almanacUpdate.create({
    data: {
      userId: user.id,
      importId: secondImport.id,
      placeId: career.id,
      state: "NOW",
      text: "Accepted a role.",
      normalisedFingerprint: "accepted a role",
      sourceLineNumber: 3,
      supersedesUpdateId: earlier.id,
    },
  });
  await prisma.almanacSubjectPreference.create({
    data: { placeId: finance.id, userId: user.id, mergedIntoPlaceId: career.id },
  });
  await prisma.almanacUpdatePreference.create({
    data: { updateId: latest.id, userId: user.id, hiddenAt: new Date() },
  });
  return { userId: user.id, password };
}

async function currentAlmanacCount(userId: string): Promise<number> {
  const counts = await Promise.all([
    prisma.almanacImport.count({ where: { userId } }),
    prisma.almanacPlace.count({ where: { userId } }),
    prisma.almanacUpdate.count({ where: { userId } }),
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

  it("erases current Almanac data atomically while retaining login and unrelated account data", async () => {
    const account = await createRichAccount("erase");
    expect(await currentAlmanacCount(account.userId)).toBeGreaterThan(0);

    await eraseAlmanacForUser(account.userId);

    expect(await currentAlmanacCount(account.userId)).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: account.userId } })).not.toBeNull();
    expect(await prisma.betaUsageEvent.count({ where: { userId: account.userId } })).toBe(1);
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
