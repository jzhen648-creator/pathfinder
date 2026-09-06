import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  acceptAlmanacSuggestion,
  listAlmanacSuggestions,
  mutateAlmanacSuggestion,
  stageAlmanacSuggestions,
  undoAlmanacSuggestionAcceptance,
} from "@/lib/almanac/suggestion-service";
import {
  AlmanacConflictError,
  AlmanacNotFoundError,
  commitAlmanacImport,
  loadAlmanacAtlas,
  undoAlmanacImport,
  updateAlmanacSubject,
} from "@/lib/almanac/service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@almanac-suggestions.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl || runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL.");
  }
  const parsed = new URL(testDatabaseUrl);
  const databaseName = parsed.pathname.replace(/^\//u, "");
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run Suggestion tests outside the disposable local database.");
  }
}

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `lifecycle-${crypto.randomUUID()}${testEmailDomain}`,
      isAnonymous: false,
    },
    select: { id: true },
  });
  return user.id;
}

integrationSuite("persistent Almanac Suggestions — PostgreSQL", () => {
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

  it("stages without changing accepted truth, then accepts, undoes, edits and re-accepts", async () => {
    const userId = await createUser();
    const staged = await stageAlmanacSuggestions(userId, {
      idempotencyKey: "persistent-source-001",
      rawPacket: [
        "ALMANAC/1",
        "scope: chat",
        "Career | NOW | The search is focused on product roles.",
      ].join("\n"),
    });
    expect(staged.disposition).toBe("created");
    expect(staged.suggestions).toHaveLength(1);
    expect((await loadAlmanacAtlas(userId)).updates).toHaveLength(0);

    const suggestion = staged.suggestions[0]!;
    const accepted = await acceptAlmanacSuggestion(userId, suggestion.id, {
      operationKey: "accept-operation-001",
      expectedVersion: 1,
    });
    expect(accepted).toMatchObject({ disposition: "accepted", applicationSequence: 1 });
    expect((await loadAlmanacAtlas(userId)).updates).toEqual([
      expect.objectContaining({ statement: "The search is focused on product roles.", active: true }),
    ]);

    const replay = await acceptAlmanacSuggestion(userId, suggestion.id, {
      operationKey: "accept-operation-001",
      expectedVersion: 1,
    });
    expect(replay).toEqual(accepted);

    await undoAlmanacSuggestionAcceptance(userId, suggestion.id, {
      operationKey: "undo-operation-001",
      expectedVersion: 2,
    });
    expect((await loadAlmanacAtlas(userId)).updates[0]).toMatchObject({ active: false, current: false });

    await mutateAlmanacSuggestion(userId, suggestion.id, {
      action: "edit",
      operationKey: "edit-between-applications-001",
      expectedVersion: 3,
      statement: "The search is focused on senior product roles.",
    });

    const acceptedAgain = await acceptAlmanacSuggestion(userId, suggestion.id, {
      operationKey: "accept-operation-002",
      expectedVersion: 4,
    });
    expect(acceptedAgain).toMatchObject({ disposition: "accepted", applicationSequence: 2 });
    expect((await listAlmanacSuggestions(userId)).suggestions[0]).toMatchObject({
      status: "accepted",
      version: 5,
      activeApplication: { sequence: 2 },
    });
    expect((await loadAlmanacAtlas(userId)).updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ statement: "The search is focused on product roles.", active: false }),
      expect.objectContaining({ statement: "The search is focused on senior product roles.", active: true }),
    ]));
  });

  it("keeps three independent outcomes across a fresh read and preserves the exact source line", async () => {
    const userId = await createUser();
    const rawPacket = [
      "ALMANAC/1",
      "scope: chat",
      "Career | NOW | One.",
      "Career | NEXT | Two.",
      "Career | OPEN | Three?",
    ].join("\n");
    const staged = await stageAlmanacSuggestions(userId, {
      idempotencyKey: "persistent-source-three",
      rawPacket,
    });
    expect((await loadAlmanacAtlas(userId)).updates).toHaveLength(0);
    const [acceptedSuggestion, dismissedSuggestion] = staged.suggestions;
    await acceptAlmanacSuggestion(userId, acceptedSuggestion!.id, {
      operationKey: "accept-three-001",
      expectedVersion: 1,
    });
    await mutateAlmanacSuggestion(userId, dismissedSuggestion!.id, {
      action: "dismiss",
      operationKey: "dismiss-three-001",
      expectedVersion: 1,
    });

    const fresh = await listAlmanacSuggestions(userId);
    expect(fresh.suggestions.map((suggestion) => suggestion.status).sort())
      .toEqual(["accepted", "dismissed", "pending"]);
    expect(fresh.suggestions.filter((suggestion) => suggestion.status === "pending")).toHaveLength(1);
    const storedSource = await prisma.almanacImport.findFirstOrThrow({
      where: { id: staged.importId, userId },
    });
    expect(storedSource.rawPacket).toBe(rawPacket);
    expect(acceptedSuggestion!.sourceLineNumber).toBe(3);
    expect((await loadAlmanacAtlas(userId)).updates).toEqual([
      expect.objectContaining({ sourceLineNumber: 3, statement: "One.", active: true }),
    ]);

    await mutateAlmanacSuggestion(userId, dismissedSuggestion!.id, {
      action: "restore",
      operationKey: "restore-three-001",
      expectedVersion: 2,
    });
    expect((await listAlmanacSuggestions(userId)).suggestions
      .find((suggestion) => suggestion.id === dismissedSuggestion!.id)).toMatchObject({
        status: "pending",
        version: 3,
      });
  });

  it("accepts an explicit revision while preserving its predecessor", async () => {
    const userId = await createUser();
    const baseline = await commitAlmanacImport(userId, {
      idempotencyKey: "revision-baseline-001",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | The old exact wording.",
      decisions: [{ lineNumber: 3, accepted: true }],
    });
    const predecessor = baseline.atlas.updates[0]!;
    const staged = await stageAlmanacSuggestions(userId, {
      idempotencyKey: "revision-source-001",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | The corrected exact wording.",
    });
    const suggestion = staged.suggestions[0]!;
    await mutateAlmanacSuggestion(userId, suggestion.id, {
      action: "edit",
      operationKey: "route-revision-001",
      expectedVersion: 1,
      placeId: predecessor.placeId,
      supersedesUpdateId: predecessor.id,
    });
    await acceptAlmanacSuggestion(userId, suggestion.id, {
      operationKey: "accept-revision-001",
      expectedVersion: 2,
    });
    const atlas = await loadAlmanacAtlas(userId);
    expect(atlas.updates.find((update) => update.id === predecessor.id)).toMatchObject({
      statement: "The old exact wording.",
      active: true,
      current: false,
    });
    expect(atlas.updates.find((update) => update.statement === "The corrected exact wording."))
      .toMatchObject({ supersedesUpdateId: predecessor.id, active: true, current: true });
  });

  it("persists edits and dismiss/restore decisions across fresh reads", async () => {
    const userId = await createUser();
    const staged = await stageAlmanacSuggestions(userId, {
      idempotencyKey: "persistent-source-002",
      rawPacket: "ALMANAC/1\nscope: chat\nStudio | NEXT | Book a session.",
    });
    const suggestionId = staged.suggestions[0]!.id;
    await mutateAlmanacSuggestion(userId, suggestionId, {
      action: "edit",
      operationKey: "edit-operation-001",
      expectedVersion: 1,
      statement: "Book the next studio session.",
    });
    await mutateAlmanacSuggestion(userId, suggestionId, {
      action: "dismiss",
      operationKey: "dismiss-operation-001",
      expectedVersion: 2,
    });
    expect((await listAlmanacSuggestions(userId)).suggestions[0]).toMatchObject({
      status: "dismissed",
      version: 3,
      draft: { statement: "Book the next studio session." },
    });
    await mutateAlmanacSuggestion(userId, suggestionId, {
      action: "restore",
      operationKey: "restore-operation-001",
      expectedVersion: 3,
    });
    expect((await listAlmanacSuggestions(userId)).suggestions[0]).toMatchObject({
      status: "pending",
      version: 4,
    });
  });

  it("serialises racing actions and enforces durable operation-key identity", async () => {
    const userId = await createUser();
    const staged = await stageAlmanacSuggestions(userId, {
      idempotencyKey: "racing-source-001",
      rawPacket: "ALMANAC/1\nscope: chat\nStudio | NEXT | Book a session.",
    });
    const suggestionId = staged.suggestions[0]!.id;
    const outcomes = await Promise.allSettled([
      mutateAlmanacSuggestion(userId, suggestionId, {
        action: "edit", operationKey: "racing-edit-001", expectedVersion: 1,
        statement: "Book the next session.",
      }),
      mutateAlmanacSuggestion(userId, suggestionId, {
        action: "dismiss", operationKey: "racing-dismiss-001", expectedVersion: 1,
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const winningIndex = outcomes.findIndex((outcome) => outcome.status === "fulfilled");
    const winningInput = winningIndex === 0
      ? { action: "edit" as const, operationKey: "racing-edit-001", expectedVersion: 1, statement: "Book the next session." }
      : { action: "dismiss" as const, operationKey: "racing-dismiss-001", expectedVersion: 1 };
    const firstResult = (outcomes[winningIndex] as PromiseFulfilledResult<unknown>).value;
    await expect(mutateAlmanacSuggestion(userId, suggestionId, winningInput)).resolves.toEqual(firstResult);
    await expect(mutateAlmanacSuggestion(userId, suggestionId, {
      ...winningInput,
      action: "edit" as const,
      statement: "Different input under the same key.",
    })).rejects.toBeInstanceOf(AlmanacConflictError);
  });

  it("protects owner and archived-Subject boundaries", async () => {
    const ownerId = await createUser();
    const otherId = await createUser();
    const baseline = await commitAlmanacImport(ownerId, {
      idempotencyKey: "archived-baseline-001",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | Existing.",
      decisions: [{ lineNumber: 3, accepted: true }],
    });
    await updateAlmanacSubject(ownerId, baseline.atlas.places[0]!.id, { archived: true });
    const staged = await stageAlmanacSuggestions(ownerId, {
      idempotencyKey: "archived-source-001",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NEXT | Proposed.",
    });
    const suggestion = staged.suggestions[0]!;
    await expect(acceptAlmanacSuggestion(otherId, suggestion.id, {
      operationKey: "cross-owner-accept-001", expectedVersion: 1,
    })).rejects.toBeInstanceOf(AlmanacNotFoundError);
    expect((await listAlmanacSuggestions(otherId)).suggestions).toHaveLength(0);
    await expect(acceptAlmanacSuggestion(ownerId, suggestion.id, {
      operationKey: "archived-accept-001", expectedVersion: 1,
    })).rejects.toBeInstanceOf(AlmanacConflictError);
  });

  it("allows sibling whole-source Undo and blocks an active external successor", async () => {
    const userId = await createUser();
    const staged = await stageAlmanacSuggestions(userId, {
      idempotencyKey: "whole-source-001",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | NOW | First.\nCareer | NOW | Second.",
    });
    const first = await acceptAlmanacSuggestion(userId, staged.suggestions[0]!.id, {
      operationKey: "whole-accept-first", expectedVersion: 1,
    });
    await mutateAlmanacSuggestion(userId, staged.suggestions[1]!.id, {
      action: "edit", operationKey: "whole-route-second", expectedVersion: 1,
      placeId: first.placeId, supersedesUpdateId: first.updateId,
    });
    const second = await acceptAlmanacSuggestion(userId, staged.suggestions[1]!.id, {
      operationKey: "whole-accept-second", expectedVersion: 2,
    });
    await commitAlmanacImport(userId, {
      idempotencyKey: "external-successor-001",
      rawPacket: "ALMANAC/1\nscope: chat\nCareer | DONE | External successor.",
      decisions: [{ lineNumber: 3, accepted: true, placeId: first.placeId, supersedesUpdateId: second.updateId }],
    });
    await expect(undoAlmanacImport(userId, staged.importId))
      .rejects.toBeInstanceOf(AlmanacConflictError);
    const external = (await loadAlmanacAtlas(userId)).imports
      .find((imported) => imported.idempotencyKey === "external-successor-001")!;
    await undoAlmanacImport(userId, external.id);
    await expect(undoAlmanacImport(userId, staged.importId)).resolves.toMatchObject({
      disposition: "undone",
    });
    expect((await loadAlmanacAtlas(userId)).updates
      .filter((update) => update.importId === staged.importId && update.active)).toHaveLength(0);
  });
});
