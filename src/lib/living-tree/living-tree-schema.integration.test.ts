import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@livingtree.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!isLoopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run Living Tree integration tests outside the isolated database.");
  }
}

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `lt-${crypto.randomUUID()}${testEmailDomain}` },
    select: { id: true },
  });
  return user.id;
}
async function createGroup(userId: string, name: string, slot: number | null) {
  return prisma.livingTreeGroup.create({
    data: { userId, name, slot, origin: "BOOTSTRAP" },
    select: { id: true, slot: true, version: true },
  });
}
async function createChapter(userId: string, title: string) {
  return prisma.goal.create({ data: { userId, title, description: "d" }, select: { id: true } });
}

integrationSuite("Living Tree group schema guarantees", () => {
  beforeAll(() => assertSafeIntegrationDatabase());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
    await prisma.$disconnect();
  });

  it("LT-S01 rejects a slot outside 1..5", async () => {
    const userId = await createUser();
    await expect(createGroup(userId, "zero", 0)).rejects.toThrow();
    await expect(createGroup(userId, "six", 6)).rejects.toThrow();
    await expect(createGroup(userId, "five", 5)).resolves.toMatchObject({ slot: 5 });
  });

  it("LT-S02 refuses to let an archived group hold a visible slot", async () => {
    const userId = await createUser();
    const group = await createGroup(userId, "career", 1);
    await expect(
      prisma.livingTreeGroup.update({ where: { id: group.id }, data: { archivedAt: new Date() } }),
    ).rejects.toThrow();
    await expect(
      prisma.livingTreeGroup.update({
        where: { id: group.id },
        data: { archivedAt: new Date(), slot: null, lastSlot: 1 },
      }),
    ).resolves.toMatchObject({ lastSlot: 1 });
  });

  it("LT-S03 allows one group per visible slot, unlimited overflow", async () => {
    const userId = await createUser();
    await createGroup(userId, "a", 2);
    await expect(createGroup(userId, "b", 2)).rejects.toThrow();
    await expect(createGroup(userId, "c", null)).resolves.toBeTruthy();
    await expect(createGroup(userId, "d", null)).resolves.toBeTruthy();
    const other = await createUser();
    await expect(createGroup(other, "same slot other user", 2)).resolves.toBeTruthy();
  });

  it("LT-S04 gives a chapter at most one group and allows none", async () => {
    const userId = await createUser();
    const [g1, g2] = [await createGroup(userId, "one", 1), await createGroup(userId, "two", 2)];
    const chapter = await createChapter(userId, "Mortgage adviser role");
    const ungrouped = await createChapter(userId, "Unfiled");

    await prisma.livingTreeGroupMembership.create({ data: { goalId: chapter.id, groupId: g1.id } });
    await expect(
      prisma.livingTreeGroupMembership.create({ data: { goalId: chapter.id, groupId: g2.id } }),
    ).rejects.toThrow();

    const moved = await prisma.livingTreeGroupMembership.update({
      where: { goalId: chapter.id },
      data: { groupId: g2.id },
    });
    expect(moved.groupId).toBe(g2.id);
    expect(
      await prisma.livingTreeGroupMembership.findUnique({ where: { goalId: ungrouped.id } }),
    ).toBeNull();
  });

  it("LT-S05 makes a cross-account membership impossible", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const ownerGroup = await createGroup(owner, "mine", 1);
    const strangerChapter = await createChapter(stranger, "Not mine");

    await expect(
      prisma.livingTreeGroupMembership.create({
        data: { goalId: strangerChapter.id, groupId: ownerGroup.id },
      }),
    ).rejects.toThrow(/cross accounts/i);
  });

  it("LT-S06 records a half-written promotion as invalid", async () => {
    const userId = await createUser();
    const group = await createGroup(userId, "career", 1);
    const chapter = await createChapter(userId, "chapter");
    const source = await prisma.importSource.create({
      data: { userId, clientImportId: crypto.randomUUID(), contentType: "TEXT",
              contentHash: crypto.randomUUID(), rawText: "x", characterCount: 1 },
      select: { id: true },
    });
    const proposal = await prisma.importProposal.create({
      data: { userId, sourceId: source.id, kind: "NEW_CHAPTER",
              processingKey: crypto.randomUUID(), proposedText: "x", targetGoalId: chapter.id },
      select: { id: true },
    });
    const application = await prisma.importProposalApplication.create({
      data: { userId, proposalId: proposal.id }, select: { id: true },
    });

    await expect(
      prisma.livingTreeApplicationEffect.create({
        data: { applicationId: application.id, groupId: group.id, promotedGroupId: group.id },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.livingTreeApplicationEffect.create({
        data: { applicationId: application.id, groupId: group.id, groupCreated: true, groupSlotAtApply: 1 },
      }),
    ).resolves.toMatchObject({ groupCreated: true });
  });

  it("LT-S07 keeps membership intact when the chapter changes owner", async () => {
    const guest = await createUser();
    const target = await createUser();
    const group = await createGroup(guest, "career", 1);
    const chapter = await createChapter(guest, "Mortgage adviser role");
    await prisma.livingTreeGroupMembership.create({ data: { goalId: chapter.id, groupId: group.id } });

    await prisma.$transaction([
      prisma.livingTreeGroup.updateMany({ where: { userId: guest }, data: { userId: target } }),
      prisma.goal.updateMany({ where: { userId: guest }, data: { userId: target } }),
    ]);

    const membership = await prisma.livingTreeGroupMembership.findUnique({
      where: { goalId: chapter.id },
    });
    expect(membership?.groupId).toBe(group.id);
  });
});
