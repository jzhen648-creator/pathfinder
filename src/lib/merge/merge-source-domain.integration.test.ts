import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeAnonymousMapIntoAccount } from "@/lib/merge-anonymous-map";
import {
  assertSourceDomainTransferred,
  SourceDomainNotTransferredError,
} from "@/lib/merge/assert-source-domain-empty";
import { mergedClientImportId } from "@/lib/merge/resolve-merge-conflicts";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@merge.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!isLoopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run merge integration tests outside the isolated local database.");
  }
}

async function createUser(label: string, anonymous: boolean): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${crypto.randomUUID()}${testEmailDomain}`,
      isAnonymous: anonymous,
      passwordHash: anonymous ? null : "hash",
    },
    select: { id: true },
  });
  return user.id;
}

type Graph = {
  goalId: string;
  sourceId: string;
  receiptId: string;
  spanId: string;
  observationId: string;
  proposalId: string;
  applicationId: string;
  revisionId: string;
};

async function seedImportGraph(
  userId: string,
  opts: { clientImportId?: string; contentHash?: string; categoryId?: string | null } = {},
): Promise<Graph> {
  const clientImportId = opts.clientImportId ?? `cap-${crypto.randomUUID()}`;
  const contentHash = opts.contentHash ?? crypto.randomUUID();

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: "Mortgage adviser role",
      description: "Career chapter",
      categoryId: opts.categoryId ?? null,
    },
    select: { id: true, categoryId: true, themeId: true },
  });
  const source = await prisma.importSource.create({
    data: {
      userId,
      clientImportId,
      contentType: "TEXT",
      contentHash,
      rawText: "I passed CeMAP in June and started advising.",
      characterCount: 43,
    },
    select: { id: true },
  });
  const receipt = await prisma.importCaptureReceipt.create({
    data: { userId, sourceId: source.id, clientImportId },
    select: { id: true },
  });
  const span = await prisma.sourceEvidenceSpan.create({
    data: {
      sourceId: source.id,
      startOffset: 2,
      endOffset: 22,
      contentHash: `${contentHash}-span`,
      text: "passed CeMAP in June",
    },
    select: { id: true },
  });
  const observation = await prisma.lifeObservation.create({
    data: { userId, kind: "FACT", canonicalText: "Passed CeMAP", canonicalKey: "cemap" },
    select: { id: true },
  });
  await prisma.observationEvidenceSpan.create({
    data: { observationId: observation.id, evidenceSpanId: span.id },
  });
  await prisma.chapterObservation.create({
    data: { userId, goalId: goal.id, observationId: observation.id },
  });
  const proposal = await prisma.importProposal.create({
    data: {
      userId,
      sourceId: source.id,
      kind: "NEW_CHAPTER",
      processingKey: `k-${crypto.randomUUID()}`,
      proposedText: "Passed CeMAP",
      targetGoalId: goal.id,
    },
    select: { id: true },
  });
  const application = await prisma.importProposalApplication.create({
    data: { userId, proposalId: proposal.id, resultObservationId: observation.id },
    select: { id: true },
  });
  const revision = await prisma.chapterRevision.create({
    data: {
      userId,
      goalId: goal.id,
      proposalId: proposal.id,
      kind: "CREATED",
      summary: "Created from source",
      afterState: { title: "Mortgage adviser role", categoryId: goal.categoryId, themeId: goal.themeId },
    },
    select: { id: true },
  });

  return {
    goalId: goal.id,
    sourceId: source.id,
    receiptId: receipt.id,
    spanId: span.id,
    observationId: observation.id,
    proposalId: proposal.id,
    applicationId: application.id,
    revisionId: revision.id,
  };
}

function runMerge(sourceUserId: string, targetUserId: string) {
  return prisma.$transaction(
    (tx) => mergeAnonymousMapIntoAccount(tx, sourceUserId, targetUserId),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

integrationSuite("guest merge preserves the source domain", () => {
  beforeAll(() => assertSafeIntegrationDatabase());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
    await prisma.$disconnect();
  });

  it("P0-F01/F02 moves every owned row and strands nothing", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    const graph = await seedImportGraph(guest);

    const result = await runMerge(guest, target);
    expect(result.movedSourceRows).toBeGreaterThan(0);

    const owned = {
      sources: await prisma.importSource.count({ where: { userId: target } }),
      receipts: await prisma.importCaptureReceipt.count({ where: { userId: target } }),
      observations: await prisma.lifeObservation.count({ where: { userId: target } }),
      chapterLinks: await prisma.chapterObservation.count({ where: { userId: target } }),
      proposals: await prisma.importProposal.count({ where: { userId: target } }),
      applications: await prisma.importProposalApplication.count({ where: { userId: target } }),
      revisions: await prisma.chapterRevision.count({ where: { userId: target } }),
      goals: await prisma.goal.count({ where: { userId: target } }),
    };
    expect(owned).toEqual({
      sources: 1, receipts: 1, observations: 1, chapterLinks: 1,
      proposals: 1, applications: 1, revisions: 1, goals: 1,
    });
    expect(await prisma.user.findUnique({ where: { id: guest } })).toBeNull();
    expect(await prisma.sourceEvidenceSpan.findUnique({ where: { id: graph.spanId } })).not.toBeNull();
  });

  it("P0-F04/F05 preserves citation identifiers and their resolution", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    const graph = await seedImportGraph(guest);

    await runMerge(guest, target);

    const link = await prisma.observationEvidenceSpan.findFirst({
      where: { observationId: graph.observationId },
      include: { evidenceSpan: { include: { source: true } } },
    });
    expect(link?.evidenceSpanId).toBe(graph.spanId);
    expect(link?.evidenceSpan.source.userId).toBe(target);
    const raw = link!.evidenceSpan.source.rawText;
    expect(raw.slice(link!.evidenceSpan.startOffset, link!.evidenceSpan.endOffset))
      .toBe("passed CeMAP in June");
  });

  it("P0-F06/F07 links identical content instead of duplicating it", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    const shared = crypto.randomUUID();
    await seedImportGraph(target, { clientImportId: "cap-shared", contentHash: shared });
    const guestGraph = await seedImportGraph(guest, { clientImportId: "cap-shared", contentHash: shared });

    await runMerge(guest, target);

    const guestSource = await prisma.importSource.findUnique({ where: { id: guestGraph.sourceId } });
    expect(guestSource?.userId).toBe(target);
    expect(guestSource?.duplicateOfId).not.toBeNull();
    expect(guestSource?.clientImportId).toBe(mergedClientImportId("cap-shared", guest));
    expect(await prisma.importCaptureReceipt.count({ where: { userId: target } })).toBe(2);
    expect(await prisma.importSource.count({ where: { userId: target, rawText: guestSource!.rawText } })).toBe(2);
  });

  it("P0-F08 keeps a colliding client id idempotent for different content", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    await seedImportGraph(target, { clientImportId: "cap-x", contentHash: crypto.randomUUID() });
    const guestGraph = await seedImportGraph(guest, { clientImportId: "cap-x", contentHash: crypto.randomUUID() });

    await runMerge(guest, target);

    const moved = await prisma.importSource.findUnique({ where: { id: guestGraph.sourceId } });
    expect(moved?.clientImportId).toBe(mergedClientImportId("cap-x", guest));
    expect(moved?.duplicateOfId).toBeNull();
    expect(await prisma.importSource.count({ where: { userId: target } })).toBe(2);
  });

  it("P0-F09 keeps same-canonicalKey observations separate", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    await seedImportGraph(target);
    await seedImportGraph(guest);

    await runMerge(guest, target);

    const observations = await prisma.lifeObservation.findMany({
      where: { userId: target, canonicalKey: "cemap" },
    });
    expect(observations).toHaveLength(2);
    expect(observations.every((o) => o.status === "ACTIVE")).toBe(true);
  });

  it("P0-F12 repairs revision filing so a merged chapter stays undoable", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    const category = await prisma.themeCategory.create({
      data: { userId: guest, themeId: "career", label: "Work", order: 0 },
      select: { id: true },
    });
    const graph = await seedImportGraph(guest, { categoryId: category.id });

    const result = await runMerge(guest, target);
    expect(result.repairedRevisions).toBeGreaterThan(0);

    const [goal, revision] = await Promise.all([
      prisma.goal.findUnique({ where: { id: graph.goalId } }),
      prisma.chapterRevision.findUnique({ where: { id: graph.revisionId } }),
    ]);
    const afterState = revision!.afterState as Record<string, unknown>;
    expect(afterState.categoryId).toBe(goal!.categoryId);
    expect(afterState.title).toBe("Mortgage adviser role");
  });

  it("P0-F17a refuses to delete the guest while a source row is still owned", async () => {
    const guest = await createUser("guest", true);
    await seedImportGraph(guest);

    await expect(assertSourceDomainTransferred(prisma, guest)).rejects.toThrow(
      SourceDomainNotTransferredError,
    );

    await expect(assertSourceDomainTransferred(prisma, guest)).rejects.toMatchObject({
      code: "SOURCE_DOMAIN_NOT_TRANSFERRED",
      stranded: expect.objectContaining({ importSource: 1, lifeObservation: 1 }),
    });
  });

  it("P0-F17b rolls the whole merge back when the assertion fails", async () => {
    const guest = await createUser("guest", true);
    const target = await createUser("target", false);
    const graph = await seedImportGraph(guest);

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.goal.updateMany({ where: { userId: guest }, data: { userId: target } });
          await tx.importSource.updateMany({ where: { userId: guest }, data: { userId: target } });
          // A row the transfer missed: the guest still owns an observation.
          await assertSourceDomainTransferred(tx, guest);
          await tx.user.delete({ where: { id: guest } });
        },
        { maxWait: 10_000, timeout: 30_000 },
      ),
    ).rejects.toThrow(SourceDomainNotTransferredError);

    // Nothing persisted: guest alive, ownership unchanged, evidence intact.
    expect(await prisma.user.findUnique({ where: { id: guest } })).not.toBeNull();
    expect(await prisma.goal.count({ where: { userId: guest } })).toBe(1);
    expect(await prisma.importSource.count({ where: { userId: guest } })).toBe(1);
    expect(await prisma.sourceEvidenceSpan.findUnique({ where: { id: graph.spanId } })).not.toBeNull();
  });
});
