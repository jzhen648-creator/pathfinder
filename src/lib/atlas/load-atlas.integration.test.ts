import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  captureAtlasPlacementsForMerge,
  restoreAtlasPlacementsAfterMerge,
} from "./merge-atlas-placements";
import { loadAtlas, updateAtlasChapterPresentation } from "./load-atlas";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@atlas.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!isLoopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run Atlas integration tests outside the isolated local database.");
  }
}

integrationSuite("Personal Atlas persistence — PostgreSQL", () => {
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

  it("keeps stable placement while Chapter meaning and presentation change", async () => {
    const user = await prisma.user.create({
      data: { email: `stable-${crypto.randomUUID()}${testEmailDomain}` },
    });
    const chapter = await prisma.goal.create({
      data: {
        userId: user.id,
        title: "Mortgage advice career",
        description: "Build a mortgage advice career.",
        background: "Seeking a first mortgage adviser role.",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const source = await prisma.importSource.create({
      data: {
        userId: user.id,
        clientImportId: `atlas-${crypto.randomUUID()}`,
        contentType: "TEXT",
        contentHash: "atlas-source-hash",
        rawText: "I accepted my first mortgage adviser role.",
        characterCount: 42,
      },
    });
    const evidenceSpan = await prisma.sourceEvidenceSpan.create({
      data: {
        sourceId: source.id,
        startOffset: 0,
        endOffset: 42,
        contentHash: "atlas-evidence-hash",
        text: "I accepted my first mortgage adviser role.",
      },
    });
    await prisma.lifeObservation.create({
      data: {
        userId: user.id,
        kind: "EVENT",
        status: "ACTIVE",
        memoryDestination: "CHAPTER",
        canonicalText: "Accepted a first mortgage adviser role.",
        confirmedAt: new Date("2026-08-10T00:00:00.000Z"),
        chapters: { create: { userId: user.id, goalId: chapter.id, role: "PRIMARY" } },
        exactEvidence: {
          create: {
            evidenceSpanId: evidenceSpan.id,
            supportType: "USER_CONFIRMED",
          },
        },
      },
    });

    const first = await loadAtlas(user.id, new Date("2026-08-11T00:00:00.000Z"));
    expect(first.chapters).toHaveLength(1);
    expect(first.chapters[0]).toMatchObject({
      id: chapter.id,
      summary: "Accepted a first mortgage adviser role.",
      slotId: 0,
      shown: true,
      recentlyChanged: true,
    });
    expect(first.chapters[0]).not.toHaveProperty("status");

    await prisma.goal.update({
      where: { id: chapter.id },
      data: { title: "First mortgage adviser role", status: "PAUSED", themeId: "work" },
    });
    const renamed = await loadAtlas(user.id, new Date("2026-08-11T00:00:00.000Z"));
    expect(renamed.chapters[0]).toMatchObject({
      title: "First mortgage adviser role",
      slotId: 0,
    });

    const hidden = await updateAtlasChapterPresentation(
      user.id,
      chapter.id,
      { shown: false, focused: true },
      new Date("2026-08-11T01:00:00.000Z"),
    );
    expect(hidden.chapters[0]).toMatchObject({ slotId: 0, shown: false, focus: true });

    const restored = await updateAtlasChapterPresentation(
      user.id,
      chapter.id,
      { shown: true },
      new Date("2026-08-11T02:00:00.000Z"),
    );
    expect(restored.chapters[0]).toMatchObject({ slotId: 0, shown: true, focus: true });
  }, 15_000);

  it("adds later Chapters without moving any existing placement", async () => {
    const user = await prisma.user.create({
      data: { email: `density-${crypto.randomUUID()}${testEmailDomain}` },
    });
    for (let index = 0; index < 40; index += 1) {
      await prisma.goal.create({
        data: {
          userId: user.id,
          title: `Chapter ${String(index + 1).padStart(2, "0")}`,
          description: `Understanding ${index + 1}`,
          createdAt: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
        },
      });
    }
    const first = await loadAtlas(user.id);
    const originalSlots = new Map(first.chapters.map((chapter) => [chapter.id, chapter.slotId]));
    expect(first.chapters).toHaveLength(40);
    expect(new Set(first.chapters.map((chapter) => chapter.slotId))).toHaveLength(40);

    const later = await prisma.goal.create({
      data: {
        userId: user.id,
        title: "A later Chapter",
        description: "Added after the first Atlas was established.",
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    });
    const second = await loadAtlas(user.id);
    expect(second.chapters).toHaveLength(41);
    for (const chapter of second.chapters) {
      if (chapter.id === later.id) continue;
      expect(chapter.slotId).toBe(originalSlots.get(chapter.id));
    }
    expect(second.chapters.find((chapter) => chapter.id === later.id)?.slotId).toBe(1);
    expect(second.chapters.filter((chapter) => chapter.shown)).toHaveLength(41);
  }, 15_000);

  it("rejects a placement that pairs one user with another user's Chapter", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner-${crypto.randomUUID()}${testEmailDomain}` },
    });
    const intruder = await prisma.user.create({
      data: { email: `intruder-${crypto.randomUUID()}${testEmailDomain}` },
    });
    const chapter = await prisma.goal.create({
      data: {
        userId: owner.id,
        title: "Owner's Chapter",
        description: "Must remain owned by its creator.",
      },
    });
    await expect(
      prisma.atlasPlacement.create({
        data: { goalId: chapter.id, userId: intruder.id, slot: 0 },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("reconciles colliding guest positions when Chapters merge into an account", async () => {
    const guest = await prisma.user.create({
      data: { email: `merge-guest-${crypto.randomUUID()}${testEmailDomain}` },
    });
    const account = await prisma.user.create({
      data: { email: `merge-account-${crypto.randomUUID()}${testEmailDomain}` },
    });
    const [guestChapter, accountChapter] = await Promise.all([
      prisma.goal.create({
        data: { userId: guest.id, title: "Guest Chapter", description: "Guest" },
      }),
      prisma.goal.create({
        data: { userId: account.id, title: "Account Chapter", description: "Account" },
      }),
    ]);
    await prisma.atlasPlacement.createMany({
      data: [
        { goalId: guestChapter.id, userId: guest.id, slot: 0 },
        { goalId: accountChapter.id, userId: account.id, slot: 0 },
      ],
    });

    await prisma.$transaction(async (transaction) => {
      const captured = await captureAtlasPlacementsForMerge(transaction, guest.id);
      await transaction.goal.update({
        where: { id: guestChapter.id },
        data: { userId: account.id },
      });
      await restoreAtlasPlacementsAfterMerge(transaction, account.id, captured);
    });

    const placements = await prisma.atlasPlacement.findMany({
      where: { userId: account.id },
      orderBy: { slot: "asc" },
    });
    expect(placements.map(({ goalId, slot }) => ({ goalId, slot }))).toEqual([
      { goalId: accountChapter.id, slot: 0 },
      { goalId: guestChapter.id, slot: 8 },
    ]);
  });
});
