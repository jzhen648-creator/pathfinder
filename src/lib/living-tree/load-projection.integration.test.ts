import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadLivingTreeProjection } from "@/lib/living-tree/load-projection";
import { prisma } from "@/lib/prisma";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@tree-loader.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const loopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!loopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run Living Tree loader tests outside the isolated database.");
  }
}

async function createUser(label: string) {
  return prisma.user.create({
    data: { email: `${label}-${crypto.randomUUID()}${testEmailDomain}` },
    select: { id: true },
  });
}

integrationSuite("Living Tree projection loader", () => {
  beforeAll(() => assertSafeIntegrationDatabase());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
    await prisma.$disconnect();
  });

  it("LT-L01 returns only the owner's cited chapters, groups, and foundations", async () => {
    const owner = await createUser("owner");
    const stranger = await createUser("stranger");
    const group = await prisma.livingTreeGroup.create({
      data: { userId: owner.id, name: "Work in London", slot: 1, origin: "BOOTSTRAP" },
    });
    const chapter = await prisma.goal.create({
      data: { userId: owner.id, title: "Mortgage adviser career", description: "Current work" },
    });
    await prisma.livingTreeGroupMembership.create({ data: { goalId: chapter.id, groupId: group.id } });

    const source = await prisma.importSource.create({
      data: {
        userId: owner.id,
        clientImportId: crypto.randomUUID(),
        contentType: "TEXT",
        contentHash: crypto.randomUUID(),
        rawText: "I passed CeMAP.",
        characterCount: 15,
      },
    });
    const fragment = await prisma.sourceFragment.create({
      data: {
        sourceId: source.id,
        position: 0,
        startOffset: 0,
        endOffset: 15,
        contentHash: crypto.randomUUID(),
        text: "I passed CeMAP.",
      },
    });
    const observation = await prisma.lifeObservation.create({
      data: {
        userId: owner.id,
        kind: "CONTEXT",
        memoryDestination: "CHAPTER",
        canonicalText: "Passed CeMAP",
        canonicalKey: "qualification:cemap",
      },
    });
    await prisma.observationEvidence.create({ data: { observationId: observation.id, fragmentId: fragment.id } });
    await prisma.chapterObservation.create({
      data: { userId: owner.id, goalId: chapter.id, observationId: observation.id },
    });
    await prisma.lifeObservation.create({
      data: {
        userId: owner.id,
        kind: "CONTEXT",
        memoryDestination: "BACKGROUND",
        backgroundCategory: "IDENTITY",
        canonicalText: "British-Chinese",
        canonicalKey: "identity:british-chinese",
      },
    });
    await prisma.goal.create({
      data: { userId: stranger.id, title: "Must stay private", description: "Other account" },
    });

    const tree = await loadLivingTreeProjection(owner.id);
    expect(tree.visibleGroups).toHaveLength(1);
    expect(tree.visibleGroups[0]?.name).toBe("Work in London");
    expect(tree.visibleGroups[0]?.chapters).toEqual([
      expect.objectContaining({ goalId: chapter.id, citedObservationCount: 1 }),
    ]);
    expect(tree.visibleGroups[0]?.latestConfirmedChange?.text).toBe("Passed CeMAP");
    expect(tree.foundations.identity).toBe(1);
    expect(JSON.stringify(tree)).not.toContain("Must stay private");
  });
});
