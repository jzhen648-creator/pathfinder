import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadLivingTreeChapterDetail,
  loadLivingTreeFoundations,
} from "@/lib/living-tree/load-details";
import { prisma } from "@/lib/prisma";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@tree-details.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const loopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!loopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run Living Tree detail tests outside the isolated database.");
  }
}

async function createUser(label: string) {
  return prisma.user.create({
    data: { email: `${label}-${crypto.randomUUID()}${testEmailDomain}` },
    select: { id: true },
  });
}

integrationSuite("Living Tree detail loaders", () => {
  beforeAll(() => assertSafeIntegrationDatabase());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
    await prisma.$disconnect();
  });

  it("LT-D01 returns exact cited chapter meaning only to its owner", async () => {
    const owner = await createUser("owner");
    const stranger = await createUser("stranger");
    const group = await prisma.livingTreeGroup.create({
      data: { userId: owner.id, name: "Career", slot: 1, origin: "BOOTSTRAP" },
    });
    const chapter = await prisma.goal.create({
      data: { userId: owner.id, title: "Mortgage advice", description: "Legacy prose" },
    });
    await prisma.livingTreeGroupMembership.create({ data: { goalId: chapter.id, groupId: group.id } });
    const rawText = "I passed CeMAP on 15 April 2026.";
    const source = await prisma.importSource.create({
      data: {
        userId: owner.id,
        clientImportId: crypto.randomUUID(),
        contentType: "TEXT",
        contentHash: crypto.randomUUID(),
        rawText,
        characterCount: rawText.length,
        title: "Life snapshot",
        sourceApp: "ChatGPT",
      },
    });
    const span = await prisma.sourceEvidenceSpan.create({
      data: {
        sourceId: source.id,
        startOffset: 0,
        endOffset: rawText.length,
        contentHash: crypto.randomUUID(),
        text: rawText,
      },
    });
    const observation = await prisma.lifeObservation.create({
      data: {
        userId: owner.id,
        kind: "EVENT",
        memoryDestination: "CHAPTER",
        temporalState: "PAST",
        temporalPrecision: "EXACT",
        canonicalText: "Passed CeMAP on 15 April 2026",
      },
    });
    await prisma.observationEvidenceSpan.create({
      data: { observationId: observation.id, evidenceSpanId: span.id },
    });
    await prisma.chapterObservation.create({
      data: { userId: owner.id, goalId: chapter.id, observationId: observation.id },
    });

    const detail = await loadLivingTreeChapterDetail(owner.id, chapter.id);
    expect(detail).toEqual(
      expect.objectContaining({
        title: "Mortgage advice",
        group: { id: group.id, name: "Career" },
      }),
    );
    expect(detail?.observations[0]).toEqual(
      expect.objectContaining({
        canonicalText: "Passed CeMAP on 15 April 2026",
        temporalState: "PAST",
        evidence: [
          expect.objectContaining({
            text: rawText,
            precision: "EXACT",
            source: expect.objectContaining({ id: source.id, sourceApp: "ChatGPT" }),
          }),
        ],
      }),
    );
    expect(await loadLivingTreeChapterDetail(stranger.id, chapter.id)).toBeNull();
  });

  it("LT-D02 keeps uncited background visible and labels legacy fragment evidence", async () => {
    const owner = await createUser("foundations");
    await prisma.lifeObservation.create({
      data: {
        userId: owner.id,
        kind: "CONTEXT",
        memoryDestination: "BACKGROUND",
        backgroundCategory: "IDENTITY",
        canonicalText: "British-Chinese",
      },
    });
    const rawText = "My brother is an apprentice.";
    const source = await prisma.importSource.create({
      data: {
        userId: owner.id,
        clientImportId: crypto.randomUUID(),
        contentType: "TEXT",
        contentHash: crypto.randomUUID(),
        rawText,
        characterCount: rawText.length,
        sourceApp: "Claude",
      },
    });
    const fragment = await prisma.sourceFragment.create({
      data: {
        sourceId: source.id,
        position: 0,
        startOffset: 0,
        endOffset: rawText.length,
        contentHash: crypto.randomUUID(),
        text: rawText,
      },
    });
    const person = await prisma.lifeObservation.create({
      data: {
        userId: owner.id,
        kind: "FACT",
        subjectType: "OTHER_PERSON",
        subjectLabel: "Brother",
        memoryDestination: "BACKGROUND",
        backgroundCategory: "PEOPLE",
        canonicalText: "My brother is an apprentice",
      },
    });
    await prisma.observationEvidence.create({
      data: { observationId: person.id, fragmentId: fragment.id },
    });

    const foundations = await loadLivingTreeFoundations(owner.id);
    expect(foundations.observations).toHaveLength(2);
    expect(foundations.observations.find((item) => item.canonicalText === "British-Chinese")?.evidence).toEqual([]);
    expect(foundations.observations.find((item) => item.id === person.id)?.evidence[0]).toEqual(
      expect.objectContaining({ precision: "LEGACY_FRAGMENT", source: expect.objectContaining({ id: source.id }) }),
    );
  });
});
