import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFakeProviderCallCount,
  LIFE_IMPORT_FIXTURE_TEXTS,
  resetFakeProviderState,
  setFakeProviderFixture,
} from "@/lib/ai/__fixtures__/fake-provider";
import { prisma } from "@/lib/prisma";
import {
  applyPossibilityProposal,
  undoPossibilityProposalApplication,
} from "./apply-possibility-proposal";
import {
  applyNewChapterProposal,
  undoNewChapterProposalApplication,
} from "./apply-new-chapter-proposal";
import { confirmLifeUpdate } from "./confirm-life-update";
import type { ImportExtractionProvider } from "./ai-import-provider";
import { ingestImportSource } from "./ingest-source";
import { processImportSource } from "./process-source";
import { withProposalReviewDecision } from "./proposal-review-decision";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@processing.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!isLoopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run import integration tests outside the isolated local database.");
  }
}

async function createUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${label}-${crypto.randomUUID()}${testEmailDomain}` },
    select: { id: true },
  });
  return user.id;
}

async function createSource(userId: string, rawText: string, label = "source") {
  return ingestImportSource(userId, {
    clientImportId: `${label}-${crypto.randomUUID()}`,
    contentType: "TEXT",
    rawText,
    exactDuplicatePolicy: "IGNORE",
    sourceApp: "Processing integration test",
  });
}

function candidate(id: string, segmentText: string, overrides: Record<string, unknown> = {}) {
  const quote = segmentText.slice(0, Math.min(segmentText.length, 240));
  return {
    id,
    classification: "new",
    canonicalKey: id,
    proposedText: `Durable observation ${id}`,
    informationType: "fact",
    subjectType: "user",
    subjectLabel: null,
    memoryDestination: "background",
    backgroundCategory: "other",
    temporal: {
      state: "unknown",
      precision: "unknown",
      effectiveFrom: null,
      effectiveTo: null,
    },
    evidence: [
      {
        startOffset: 0,
        endOffset: quote.length,
        quote,
        role: "supports",
        supportType: "explicit",
      },
    ],
    confidence: 0.85,
    targetGoalIds: [],
    existingObservationId: null,
    rationale: "Deterministic integration fixture.",
    ...overrides,
  };
}

integrationSuite("import source processing — PostgreSQL", () => {
  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    await prisma.$connect();
  });

  beforeEach(() => {
    vi.stubEnv("AI_FAKE_PROVIDER", "1");
    resetFakeProviderState();
  });

  afterEach(async () => {
    resetFakeProviderState();
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates reviewable proposals without mutating chapters or observations", async () => {
    const userId = await createUser("happy");
    const stored = await createSource(userId, "I have been consistently walking before work.");

    const result = await processImportSource(userId, stored.source.id);

    expect(result).toMatchObject({ status: "completed", proposalCount: 1 });
    expect(getFakeProviderCallCount()).toBe(1);
    expect(await prisma.goal.count({ where: { userId } })).toBe(0);
    expect(await prisma.lifeObservation.count({ where: { userId } })).toBe(0);
    const source = await prisma.importSource.findUniqueOrThrow({ where: { id: stored.source.id } });
    expect(source.state).toBe("AWAITING_REVIEW");
    const fragment = await prisma.sourceFragment.findFirstOrThrow({
      where: { sourceId: source.id },
    });
    expect(source.rawText.slice(fragment.startOffset, fragment.endOffset)).toBe(fragment.text);
    const proposal = await prisma.importProposal.findFirstOrThrow({
      where: { sourceId: source.id },
      include: { exactEvidence: { include: { evidenceSpan: true } } },
    });
    expect(proposal.exactEvidence).toHaveLength(1);
    const citation = proposal.exactEvidence[0]!.evidenceSpan;
    expect(source.rawText.slice(citation.startOffset, citation.endOffset)).toBe(citation.text);
    expect(proposal).toMatchObject({
      informationType: "FACT",
      subjectType: "USER",
      memoryDestination: "BACKGROUND",
      temporalState: "UNKNOWN",
    });
  });

  it("rolls back every selected item when one item cannot be applied", async () => {
    const userId = await createUser("atomic-confirm");
    const text = "I live in London and I work in property.";
    const stored = await createSource(userId, text, "atomic-confirm");
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        return {
          candidates: [
            candidate("home-city", input.segmentText, {
              canonicalKey: "background:home-city",
              proposedText: "I live in London.",
            }),
            candidate("career-sector", input.segmentText, {
              canonicalKey: "background:career-sector",
              proposedText: "I work in property.",
            }),
          ],
        };
      },
    };
    await processImportSource(userId, stored.source.id, { provider });
    const proposals = await prisma.importProposal.findMany({
      where: { sourceId: stored.source.id },
      orderBy: { createdAt: "asc" },
    });
    expect(proposals).toHaveLength(2);
    for (const proposal of proposals) {
      await prisma.importProposal.update({
        where: { id: proposal.id },
        data: { payload: withProposalReviewDecision(proposal.payload, "accept") },
      });
    }
    await prisma.importProposalEvidence.deleteMany({
      where: { proposalId: proposals[1]!.id },
    });

    await expect(confirmLifeUpdate(userId, stored.source.id)).rejects.toMatchObject({
      code: "MISSING_EVIDENCE",
    });
    expect(await prisma.lifeObservation.count({ where: { userId } })).toBe(0);
    expect(await prisma.importProposalApplication.count({ where: { userId } })).toBe(0);
    expect(
      await prisma.importProposal.count({
        where: { sourceId: stored.source.id, status: "PENDING" },
      }),
    ).toBe(2);
  });

  it("creates, undoes, and reapplies one cited new chapter without duplicating it", async () => {
    const userId = await createUser("new-chapter");
    const text = "I have decided to return to London on 16 August 2026 and rebuild my life there.";
    const stored = await createSource(userId, text, "new-chapter");
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        return {
          candidates: [
            candidate("return-london", input.segmentText, {
              classification: "new_chapter",
              canonicalKey: "relocation:return-london",
              proposedText: "Returning to London on 16 August 2026 to rebuild my UK base.",
              chapterTitle: "Return to London",
              primaryThemeId: "people",
              informationType: "decision",
              memoryDestination: "chapter",
              backgroundCategory: null,
              temporal: {
                state: "planned",
                precision: "exact",
                effectiveFrom: "2026-08-16",
                effectiveTo: null,
              },
            }),
          ],
        };
      },
    };

    expect(await processImportSource(userId, stored.source.id, { provider })).toMatchObject({
      status: "completed",
      proposalCount: 1,
    });
    const proposal = await prisma.importProposal.findFirstOrThrow({
      where: { sourceId: stored.source.id },
    });
    const applied = await applyNewChapterProposal(userId, stored.source.id, proposal.id);
    expect(applied.status).toBe("applied");
    const chapter = await prisma.goal.findUniqueOrThrow({ where: { id: applied.chapterId } });
    expect(chapter).toMatchObject({
      title: "Return to London",
      themeId: "people",
      archived: false,
      aiGenerated: false,
    });
    expect(await prisma.chapterRevision.count({ where: { goalId: chapter.id } })).toBe(1);
    expect(await prisma.chapterObservation.count({ where: { goalId: chapter.id } })).toBe(1);

    expect(await applyNewChapterProposal(userId, stored.source.id, proposal.id)).toMatchObject({
      status: "already_applied",
      chapterId: chapter.id,
    });
    expect(await prisma.goal.count({ where: { userId } })).toBe(1);

    expect(
      await undoNewChapterProposalApplication(userId, stored.source.id, proposal.id),
    ).toMatchObject({ status: "undone", chapterId: chapter.id });
    expect(await prisma.goal.findUniqueOrThrow({ where: { id: chapter.id } })).toMatchObject({
      archived: true,
    });

    expect(await applyNewChapterProposal(userId, stored.source.id, proposal.id)).toMatchObject({
      status: "applied",
      chapterId: chapter.id,
    });
    expect(await prisma.goal.count({ where: { userId } })).toBe(1);
    expect(await prisma.goal.findUniqueOrThrow({ where: { id: chapter.id } })).toMatchObject({
      archived: false,
    });
  }, 15_000);

  it("preserves an explored possibility and targets it when the user later rejects it", async () => {
    const userId = await createUser("idea-decision");
    const explorationSource = await createSource(
      userId,
      LIFE_IMPORT_FIXTURE_TEXTS.ideaExploration,
      "idea-exploration",
    );
    setFakeProviderFixture("importIdeaExploration");

    expect((await processImportSource(userId, explorationSource.source.id)).status).toBe(
      "completed",
    );

    const explorationProposal = await prisma.importProposal.findFirstOrThrow({
      where: { sourceId: explorationSource.source.id },
      include: { exactEvidence: { include: { evidenceSpan: true } } },
    });
    expect(explorationProposal).toMatchObject({
      kind: "NEW_OBSERVATION",
      informationType: "POSSIBILITY",
      memoryDestination: "POSSIBILITY",
      temporalState: "POSSIBLE",
      status: "PENDING",
      targetGoalId: null,
    });
    expect(await prisma.goal.count({ where: { userId } })).toBe(0);

    const explorationApplied = await applyPossibilityProposal(
      userId,
      explorationSource.source.id,
      explorationProposal.id,
      new Date("2026-08-01T12:00:00.000Z"),
    );
    expect(explorationApplied).toMatchObject({ status: "applied", sourceState: "APPLIED" });
    const acceptedPossibility = await prisma.lifeObservation.findUniqueOrThrow({
      where: { id: explorationApplied.observationId },
      include: { exactEvidence: true },
    });
    expect(acceptedPossibility).toMatchObject({
      kind: "POSSIBILITY",
      status: "ACTIVE",
      canonicalKey: "business:ev9-private-tours",
      canonicalText: explorationProposal.proposedText,
      memoryDestination: "POSSIBILITY",
      supersedesObservationId: null,
    });
    expect(acceptedPossibility.exactEvidence).toHaveLength(1);

    const rejectionSource = await createSource(
      userId,
      LIFE_IMPORT_FIXTURE_TEXTS.ideaRejection,
      "idea-rejection",
    );
    setFakeProviderFixture("importIdeaRejection");

    expect((await processImportSource(userId, rejectionSource.source.id)).status).toBe(
      "completed",
    );

    const rejectionProposal = await prisma.importProposal.findFirstOrThrow({
      where: { sourceId: rejectionSource.source.id },
      include: { exactEvidence: { include: { evidenceSpan: true } } },
    });
    expect(rejectionProposal).toMatchObject({
      kind: "UPDATE",
      informationType: "DECISION",
      memoryDestination: "POSSIBILITY",
      temporalState: "PAST",
      temporalPrecision: "EXACT",
      effectiveFrom: new Date("2026-08-02T00:00:00.000Z"),
      status: "PENDING",
      observationId: acceptedPossibility.id,
      targetGoalId: null,
    });
    const rejectionEvidence = rejectionProposal.exactEvidence[0]!.evidenceSpan;
    expect(rejectionSource.source.rawText.slice(rejectionEvidence.startOffset, rejectionEvidence.endOffset)).toBe(
      rejectionEvidence.text,
    );
    const rejectionApplied = await applyPossibilityProposal(
      userId,
      rejectionSource.source.id,
      rejectionProposal.id,
      new Date("2026-08-02T12:00:00.000Z"),
    );
    expect(rejectionApplied).toMatchObject({ status: "applied", sourceState: "APPLIED" });
    const closedPossibility = await prisma.lifeObservation.findUniqueOrThrow({
      where: { id: acceptedPossibility.id },
    });
    const acceptedRejection = await prisma.lifeObservation.findUniqueOrThrow({
      where: { id: rejectionApplied.observationId },
      include: { exactEvidence: true },
    });
    expect(closedPossibility).toMatchObject({
      status: "RESOLVED",
      effectiveTo: new Date("2026-08-02T00:00:00.000Z"),
    });
    expect(acceptedRejection).toMatchObject({
      kind: "DECISION",
      status: "ACTIVE",
      canonicalKey: "business:ev9-private-tours",
      supersedesObservationId: acceptedPossibility.id,
      canonicalText: rejectionProposal.proposedText,
    });
    expect(acceptedRejection.exactEvidence).toHaveLength(1);
    expect(
      await applyPossibilityProposal(
        userId,
        rejectionSource.source.id,
        rejectionProposal.id,
        new Date("2026-08-02T12:01:00.000Z"),
      ),
    ).toMatchObject({
      status: "already_applied",
      observationId: acceptedRejection.id,
    });

    expect(
      await undoPossibilityProposalApplication(
        userId,
        rejectionSource.source.id,
        rejectionProposal.id,
        new Date("2026-08-02T12:02:00.000Z"),
      ),
    ).toMatchObject({ status: "undone", sourceState: "AWAITING_REVIEW" });
    expect(
      await prisma.lifeObservation.findUniqueOrThrow({ where: { id: acceptedPossibility.id } }),
    ).toMatchObject({
      status: "ACTIVE",
      effectiveTo: null,
      canonicalText: explorationProposal.proposedText,
    });
    expect(
      await prisma.lifeObservation.findUniqueOrThrow({ where: { id: acceptedRejection.id } }),
    ).toMatchObject({ status: "DISMISSED" });

    const reapplied = await applyPossibilityProposal(
      userId,
      rejectionSource.source.id,
      rejectionProposal.id,
      new Date("2026-08-02T12:03:00.000Z"),
    );
    expect(reapplied).toMatchObject({
      status: "applied",
      observationId: acceptedRejection.id,
      sourceState: "APPLIED",
    });
    expect(await prisma.importProposalApplication.count({ where: { userId } })).toBe(2);
    expect(await prisma.importSource.count({ where: { userId } })).toBe(2);
    expect(
      await prisma.sourceEvidenceSpan.count({ where: { source: { userId } } }),
    ).toBe(2);
    expect(await prisma.goal.count({ where: { userId } })).toBe(0);
  });

  it("uses canonical chapter background instead of the retired description for matching", async () => {
    const userId = await createUser("background-context");
    await prisma.goal.create({
      data: {
        userId,
        title: "Return to London",
        description: "Retired generated description that must not be sent.",
        background: "I plan to return to London in August.",
      },
    });
    const stored = await createSource(userId, "I return to London on 16 August 2026.");
    let seenBackground: string | null | undefined;
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        seenBackground = input.context.goals[0]?.background;
        return { candidates: [candidate("london-return", input.segmentText)] };
      },
    };

    expect((await processImportSource(userId, stored.source.id, { provider })).status).toBe(
      "completed",
    );
    expect(seenBackground).toBe("I plan to return to London in August.");
  });

  it("marks a source processed when extraction finds no durable user-owned meaning", async () => {
    const userId = await createUser("empty");
    const stored = await createSource(userId, "A quoted answer with no facts about me.");
    setFakeProviderFixture("importNoDurableValue");

    const result = await processImportSource(userId, stored.source.id);

    expect(result).toMatchObject({
      status: "completed",
      proposalCount: 0,
      retainedOnlyCount: 1,
    });
    expect(
      await prisma.importSource.findUniqueOrThrow({ where: { id: stored.source.id } }),
    ).toMatchObject({ state: "PROCESSED" });
  });

  it("retries one transient 503 inside the run and then succeeds", async () => {
    const userId = await createUser("transient");
    const stored = await createSource(userId, "A durable change worth extracting.");
    const wait = vi.fn(async () => undefined);
    let attempts = 0;
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("temporary private failure"), { status: 503 });
        return { candidates: [candidate("after-retry", input.segmentText)] };
      },
    };

    const result = await processImportSource(userId, stored.source.id, { provider, sleep: wait });

    expect(result.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("preserves successful segments and resumes only failed work", async () => {
    const userId = await createUser("resume");
    const stored = await createSource(userId, "A".repeat(8_500));
    const calls: number[] = [];
    let failFirstSegment = true;
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        calls.push(input.segmentPosition);
        if (input.segmentPosition === 0 && failFirstSegment) {
          return { invalid: "private malformed output" };
        }
        return { candidates: [candidate(`segment-${input.segmentPosition}`, input.segmentText)] };
      },
    };

    const first = await processImportSource(userId, stored.source.id, { provider });
    expect(first).toMatchObject({ status: "needs_retry", failedSegments: [0] });
    const succeededBeforeResume = await prisma.importSegmentRun.count({
      where: { jobId: first.jobId, status: "SUCCEEDED" },
    });
    expect(succeededBeforeResume).toBeGreaterThan(0);

    failFirstSegment = false;
    const second = await processImportSource(userId, stored.source.id, {
      provider,
      forceRetry: true,
    });
    expect(second.status).toBe("completed");
    expect(calls.filter((position) => position === 0)).toHaveLength(2);
    for (const position of new Set(calls.filter((value) => value !== 0))) {
      expect(calls.filter((value) => value === position)).toHaveLength(1);
    }
  });

  it("bounds each invocation and resumes pending segments", async () => {
    const userId = await createUser("bounded-run");
    const stored = await createSource(userId, "B".repeat(8_500));
    const calls: number[] = [];
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        calls.push(input.segmentPosition);
        return { candidates: [candidate(`bounded-${input.segmentPosition}`, input.segmentText)] };
      },
    };

    const first = await processImportSource(userId, stored.source.id, {
      provider,
      maxSegmentsPerRun: 1,
    });
    expect(first.status).toBe("more_pending");
    expect(calls).toEqual([0]);

    const second = await processImportSource(userId, stored.source.id, {
      provider,
      maxSegmentsPerRun: 10,
    });
    expect(second.status).toBe("completed");
    expect(calls.filter((position) => position === 0)).toHaveLength(1);
  });

  it("returns already-processing instead of starting a second provider run", async () => {
    const userId = await createUser("single-flight");
    const stored = await createSource(userId, "One source must have one active processing run.");
    let releaseProvider!: () => void;
    let markProviderEntered!: () => void;
    const providerEntered = new Promise<void>((resolve) => {
      markProviderEntered = resolve;
    });
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        markProviderEntered();
        await providerReleased;
        return { candidates: [candidate("single-flight", input.segmentText)] };
      },
    };

    const firstPromise = processImportSource(userId, stored.source.id, { provider });
    await providerEntered;
    const second = await processImportSource(userId, stored.source.id, { provider });
    expect(second.status).toBe("already_processing");

    releaseProvider();
    expect((await firstPromise).status).toBe("completed");
    expect(await prisma.importSegmentRun.count({ where: { attempt: 1 } })).toBe(1);
  });

  it("stores five primary proposals and keeps additional suggestions as overflow", async () => {
    const userId = await createUser("overflow");
    const stored = await createSource(userId, "Several durable changes belong in review.");
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        return {
          candidates: Array.from({ length: 8 }, (_, index) =>
            candidate(`item-${index}`, input.segmentText),
          ),
        };
      },
    };

    const result = await processImportSource(userId, stored.source.id, { provider });

    expect(result).toMatchObject({ status: "completed", proposalCount: 8, overflowCount: 3 });
    const proposals = await prisma.importProposal.findMany({ where: { sourceId: stored.source.id } });
    const buckets = proposals.map(
      (proposal) => (proposal.payload as { reviewBucket: "primary" | "overflow" }).reviewBucket,
    );
    expect(buckets.filter((bucket) => bucket === "primary")).toHaveLength(5);
    expect(buckets.filter((bucket) => bucket === "overflow")).toHaveLength(3);
  });

  it("rejects provider references to another user's chapter", async () => {
    const ownerId = await createUser("reference-owner");
    const otherUserId = await createUser("reference-other");
    const otherGoal = await prisma.goal.create({
      data: {
        userId: otherUserId,
        title: "Private chapter",
        description: "Must never be connected across users.",
      },
    });
    const stored = await createSource(ownerId, "An ambiguous source.");
    const provider: ImportExtractionProvider = {
      async extractSegment(input) {
        return {
          candidates: [
            candidate("unsafe-reference", input.segmentText, { targetGoalIds: [otherGoal.id] }),
          ],
        };
      },
    };

    const result = await processImportSource(ownerId, stored.source.id, { provider });

    expect(result).toMatchObject({ status: "failed", errorCode: "UNSAFE_PROVIDER_REFERENCE" });
    expect(await prisma.importProposal.count({ where: { sourceId: stored.source.id } })).toBe(0);
  });

  it("persists a safe retry code for rate limits without storing private error text", async () => {
    const userId = await createUser("rate-limit");
    const stored = await createSource(userId, "Private source body that must not enter errors.");
    const provider: ImportExtractionProvider = {
      async extractSegment() {
        throw Object.assign(new Error("Private source body that must not enter errors."), {
          status: 429,
        });
      },
    };

    const result = await processImportSource(userId, stored.source.id, { provider });

    expect(result.status).toBe("needs_retry");
    const job = await prisma.importJob.findFirstOrThrow({ where: { sourceId: stored.source.id } });
    const segment = await prisma.importSegmentRun.findFirstOrThrow({ where: { jobId: job.id } });
    expect(segment.errorCode).toBe("PROVIDER_RATE_LIMITED");
    expect(segment.nextRetryAt).not.toBeNull();
    expect(`${job.errorCode} ${job.errorDetail}`).not.toContain("Private source body");
  });
});
