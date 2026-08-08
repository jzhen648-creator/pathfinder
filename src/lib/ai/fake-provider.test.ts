import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFakeProviderCallCount,
  isFakeProviderEnabled,
  LIFE_IMPORT_FIXTURE_TEXTS,
  resetFakeProviderState,
  setFakeProviderFixture,
} from "@/lib/ai/__fixtures__/fake-provider";
import { generateJsonCompletion } from "@/lib/ai-client";
import {
  assertExtractionEvidenceMatchesSegment,
  parseImportExtractionResult,
} from "@/lib/imports/extraction-contract";
import { partitionProposalCandidates, type ReconciliationCandidate } from "@/lib/imports/reconciliation";

async function importFixture(
  fixture:
    | "importLifeSnapshot"
    | "importRawConversation"
    | "importCustomSummary"
    | "importIdeaExploration"
    | "importIdeaRejection",
  text: string,
  observations: Array<{ id: string; kind: string; canonicalText: string }> = [],
) {
  setFakeProviderFixture(fixture);
  const json = await generateJsonCompletion({
    system: "test",
    user: [
      "<import_segment>",
      JSON.stringify({ sourceId: "source-1", position: 0, text }),
      "</import_segment>",
      "<existing_life_model>",
      JSON.stringify({ goals: [], observations }),
      "</existing_life_model>",
    ].join("\n"),
  });
  return assertExtractionEvidenceMatchesSegment(parseImportExtractionResult(JSON.parse(json)), text);
}

describe("AI_FAKE_PROVIDER seam", () => {
  const originalEnv = process.env.AI_FAKE_PROVIDER;

  beforeEach(() => {
    process.env.AI_FAKE_PROVIDER = "1";
    resetFakeProviderState();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AI_FAKE_PROVIDER;
    } else {
      process.env.AI_FAKE_PROVIDER = originalEnv;
    }
    resetFakeProviderState();
    vi.restoreAllMocks();
  });

  it("is enabled when AI_FAKE_PROVIDER=1", () => {
    expect(isFakeProviderEnabled()).toBe(true);
  });

  it("returns deterministic JSON without calling OpenAI", async () => {
    const json = await generateJsonCompletion({
      system: "test",
      user: '<dirty_pursuits>\n["p-cemap"]\n</dirty_pursuits>\nReturn ONLY: { "pursuits": { ... } }',
    });

    expect(JSON.parse(json).pursuits["p-cemap"]).toBeDefined();
    expect(getFakeProviderCallCount()).toBe(1);
  });

  it("throws 429 when fixture is rateLimit429", async () => {
    setFakeProviderFixture("rateLimit429");

    await expect(
      generateJsonCompletion({ system: "test", user: "any" }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("returns malformed JSON when fixture is malformed", async () => {
    setFakeProviderFixture("malformed");

    const json = await generateJsonCompletion({ system: "test", user: "any" });
    expect(json).toContain("not valid json");
  });

  it("returns deterministic import candidates for import segments", async () => {
    const json = await generateJsonCompletion({
      system: "test",
      user: '<import_segment>\n{"sourceId":"source-1","position":3,"text":"private"}\n</import_segment>',
    });

    expect(JSON.parse(json).candidates[0]).toMatchObject({
      id: "candidate-3",
      canonicalKey: "segment-3",
    });
  });

  it("turns a fictional full-life snapshot into five review items without promoting advice", async () => {
    const result = await importFixture("importLifeSnapshot", LIFE_IMPORT_FIXTURE_TEXTS.snapshot);
    const candidates = result.candidates.map((candidate) => ({
      ...candidate,
      evidence: candidate.evidence.map((evidence) => ({ ...evidence, segmentId: "segment-1" })),
    })) as ReconciliationCandidate[];
    const partition = partitionProposalCandidates(candidates);

    expect(partition.primary).toHaveLength(5);
    expect(partition.overflow).toHaveLength(0);
    expect(partition.retainedOnly).toHaveLength(1);
    expect(partition.retainedOnly[0]).toMatchObject({
      informationType: "advice",
      memoryDestination: "source_only",
    });
    expect(result.candidates.find((candidate) => candidate.id === "brother-background")).toMatchObject({
      subjectType: "other_person",
      subjectLabel: "Alex's brother",
      memoryDestination: "background",
    });
    expect(result.candidates.find((candidate) => candidate.id === "housing-possibility")).toMatchObject({
      informationType: "possibility",
      temporal: { state: "possible" },
    });
  });

  it("extracts the same dated relocation from raw conversation without treating assistant advice as a decision", async () => {
    const snapshot = await importFixture("importLifeSnapshot", LIFE_IMPORT_FIXTURE_TEXTS.snapshot);
    const conversation = await importFixture(
      "importRawConversation",
      LIFE_IMPORT_FIXTURE_TEXTS.rawConversation,
    );
    const snapshotReturn = snapshot.candidates.find((candidate) => candidate.id === "return-date-update");
    const conversationReturn = conversation.candidates.find((candidate) => candidate.id === "return-date-raw");

    expect(conversationReturn).toMatchObject({
      canonicalKey: snapshotReturn?.canonicalKey,
      informationType: "commitment",
      temporal: { state: "planned", precision: "exact", effectiveFrom: "2026-08-16" },
    });
    expect(conversation.candidates.find((candidate) => candidate.id === "assistant-career-advice")).toMatchObject({
      classification: "no_durable_value",
      informationType: "advice",
      memoryDestination: "source_only",
    });
    expect(conversation.candidates.find((candidate) => candidate.id === "marriage-status-unresolved")).toMatchObject({
      informationType: "open_question",
      temporal: { state: "unresolved" },
    });
  });

  it("separates reinforcement from a newer conflicting date in a custom summary", async () => {
    const result = await importFixture("importCustomSummary", LIFE_IMPORT_FIXTURE_TEXTS.customSummary);

    expect(result.candidates.find((candidate) => candidate.id === "return-date-reinforcement")).toMatchObject({
      classification: "reinforcement",
      temporal: { effectiveFrom: "2026-08-16" },
    });
    expect(result.candidates.find((candidate) => candidate.id === "return-date-conflict")).toMatchObject({
      classification: "conflict",
      informationType: "possibility",
      temporal: { state: "unresolved", effectiveFrom: "2026-08-30" },
    });
  });

  it("keeps an explored business idea separate from a later decision to reject it", async () => {
    const exploration = await importFixture(
      "importIdeaExploration",
      LIFE_IMPORT_FIXTURE_TEXTS.ideaExploration,
    );
    const proposedPossibility = exploration.candidates[0];

    expect(proposedPossibility).toMatchObject({
      classification: "new",
      canonicalKey: "business:ev9-private-tours",
      informationType: "possibility",
      memoryDestination: "possibility",
      temporal: { state: "possible", precision: "unknown" },
      targetGoalIds: [],
      existingObservationId: null,
    });

    const rejection = await importFixture(
      "importIdeaRejection",
      LIFE_IMPORT_FIXTURE_TEXTS.ideaRejection,
      [
        {
          id: "accepted-ev9-possibility",
          kind: "POSSIBILITY",
          canonicalText: proposedPossibility!.proposedText,
        },
      ],
    );

    expect(rejection.candidates[0]).toMatchObject({
      classification: "update",
      canonicalKey: proposedPossibility?.canonicalKey,
      informationType: "decision",
      memoryDestination: "possibility",
      temporal: { state: "past", precision: "exact", effectiveFrom: "2026-08-02" },
      targetGoalIds: [],
      existingObservationId: "accepted-ev9-possibility",
    });
  });
});
