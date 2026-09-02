import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  AlmanacConflictError,
  AlmanacNotFoundError,
  AlmanacValidationError,
  commitAlmanacImport,
  createDirectAlmanacSubjectUpdate,
  loadAlmanacAtlas,
  loadAlmanacImport,
  loadAlmanacPlace,
  mergeAlmanacSubjects,
  unmergeAlmanacSubject,
  undoAlmanacImport,
  updateAlmanacSubject,
  updateAlmanacUpdatePreference,
} from "@/lib/almanac/service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@almanac-dogfood.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//u, "");
  const loopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!loopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run Almanac dogfood integration tests outside the isolated local database.");
  }
}

async function createUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${label}-${crypto.randomUUID()}${testEmailDomain}`, isAnonymous: false },
    select: { id: true },
  });
  return user.id;
}

function input(
  idempotencyKey: string,
  lines: string[],
  decisions = lines.map((_, index) => ({ lineNumber: index + 3, accepted: true })),
) {
  return {
    idempotencyKey,
    rawPacket: ["ALMANAC/1", "scope: chat", ...lines].join("\n"),
    decisions,
  };
}

async function eventually<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  let latest = await read();
  for (let attempt = 0; attempt < 40 && !predicate(latest); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    latest = await read();
  }
  return latest;
}

async function nonAlmanacTableCounts(): Promise<Map<string, bigint>> {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacUpdateSupersession', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
    ORDER BY table_name
  `;
  const counts = new Map<string, bigint>();
  for (const { table_name: tableName } of tables) {
    const safeTableName = tableName.replaceAll('"', '""');
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM public."${safeTableName}"`,
    );
    counts.set(tableName, rows[0]?.count ?? BigInt(0));
  }
  return counts;
}

integrationSuite("persisted Almanac dogfood — PostgreSQL", () => {
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

  it("applies the owner-scoped RLS-protected Almanac tables", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string; row_security: boolean }>>`
      SELECT cls.relname AS table_name, cls.relrowsecurity AS row_security
      FROM pg_class cls
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public'
        AND cls.relname IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacUpdateSupersession', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
      ORDER BY cls.relname
    `;
    expect(tables).toHaveLength(6);
    expect(tables).toEqual(expect.arrayContaining([
      { table_name: "AlmanacImport", row_security: true },
      { table_name: "AlmanacPlace", row_security: true },
      { table_name: "AlmanacSubjectPreference", row_security: true },
      { table_name: "AlmanacUpdatePreference", row_security: true },
      { table_name: "AlmanacUpdateSupersession", row_security: true },
      { table_name: "AlmanacUpdate", row_security: true },
    ]));

    const policies = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacUpdateSupersession', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
    `;
    expect(policies[0]?.count).toBe(BigInt(0));

    const exposedGrants = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacUpdateSupersession', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    `;
    expect(exposedGrants[0]?.count).toBe(BigInt(0));

    const edgeServiceRoleGrants = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = 'AlmanacUpdateSupersession'
        AND grantee = 'service_role'
    `;
    expect(edgeServiceRoleGrants[0]?.count).toBe(BigInt(0));

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacUpdateSupersession')
    `;
    const indexNames = new Set(indexes.map((index) => index.indexname));
    for (const required of [
      "AlmanacImport_userId_idempotencyKey_key",
      "AlmanacPlace_userId_normalisedName_key",
      "AlmanacPlace_userId_slot_key",
      "AlmanacUpdate_importId_sourceLineNumber_key",
      "AlmanacUpdate_userId_placeId_state_createdAt_idx",
      "AlmanacUpdateSupersession_userId_predecessorUpdateId_idx",
      "AlmanacUpdateSupersession_userId_successorUpdateId_idx",
    ]) {
      expect(indexNames.has(required), `missing index ${required}`).toBe(true);
    }

    const constraints = await prisma.$queryRaw<Array<{ conname: string; definition: string }>>`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN (
        'public."AlmanacImport"'::regclass,
        'public."AlmanacPlace"'::regclass,
        'public."AlmanacUpdate"'::regclass,
        'public."AlmanacUpdateSupersession"'::regclass
      )
    `;
    const constraintByName = new Map(constraints.map((constraint) => [constraint.conname, constraint.definition]));
    expect(constraintByName.get("AlmanacUpdate_importId_userId_fkey")).toContain(
      'FOREIGN KEY ("importId", "userId")',
    );
    expect(constraintByName.get("AlmanacUpdate_placeId_userId_fkey")).toContain(
      'FOREIGN KEY ("placeId", "userId")',
    );
    expect(constraintByName.get("AlmanacUpdate_supersedesUpdateId_userId_fkey")).toContain(
      'FOREIGN KEY ("supersedesUpdateId", "userId")',
    );
    expect(constraintByName.get("AlmanacUpdateSupersession_successorUpdateId_userId_fkey")).toContain(
      'FOREIGN KEY ("successorUpdateId", "userId")',
    );
    expect(constraintByName.get("AlmanacUpdateSupersession_predecessorUpdateId_userId_fkey")).toContain(
      'FOREIGN KEY ("predecessorUpdateId", "userId")',
    );
    expect(constraintByName.has("AlmanacPlace_slot_range")).toBe(false);

    const triggers = await prisma.$queryRaw<Array<{ trigger_name: string }>>`
      SELECT tgname AS trigger_name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN (
          'public."AlmanacImport"'::regclass,
          'public."AlmanacPlace"'::regclass,
          'public."AlmanacUpdate"'::regclass,
          'public."AlmanacUpdateSupersession"'::regclass,
          'public."AlmanacUpdatePreference"'::regclass
        )
      ORDER BY tgname
    `;
    expect(triggers.map((trigger) => trigger.trigger_name)).toHaveLength(6);
    expect(triggers.map((trigger) => trigger.trigger_name)).toEqual(expect.arrayContaining([
      "AlmanacImport_immutable_provenance",
      "AlmanacPlace_append_only",
      "AlmanacUpdate_append_only",
      "AlmanacUpdateSupersession_append_only",
      "AlmanacUpdateSupersession_integrity",
      "AlmanacUpdatePreference_next_target_date",
    ]));
  });

  it("does not write any legacy product table during an Almanac commit", async () => {
    const userId = await createUser("legacy-write-boundary");
    const before = await nonAlmanacTableCounts();
    await commitAlmanacImport(
      userId,
      input("legacy-write-boundary", ["Notebook | NOW | Contains synthetic notes."]),
    );
    expect(await nonAlmanacTableCounts()).toEqual(before);
  });

  it("creates more than 64 Subjects without Atlas capacity or dispersion ordering", async () => {
    const userId = await createUser("subject-capacity");
    await prisma.almanacPlace.createMany({
      data: Array.from({ length: 64 }, (_, slot) => ({
        userId,
        name: `Existing subject ${slot}`,
        normalisedName: `existing subject ${slot}`,
        slot,
      })),
    });

    const committed = await commitAlmanacImport(
      userId,
      input("subject-capacity-65", ["Sixty fifth subject | NOW | The Subject is retained without a map position."]),
    );
    const created = committed.atlas.places.find((place) => place.name === "Sixty fifth subject");
    expect(created?.slot).toBe(64);
    expect(committed.atlas.places).toHaveLength(65);
  });

  it("enforces immutable provenance, append-only history and database uniqueness", async () => {
    const userId = await createUser("invariants-a");
    const otherUserId = await createUser("invariants-b");
    const committed = await commitAlmanacImport(
      userId,
      input("invariants-client", ["Test archive | NOW | The archive is active."]),
    );
    const importId = committed.import.id;
    const place = committed.atlas.places[0]!;
    const update = committed.atlas.updates[0]!;

    for (const data of [
      { rawPacket: "changed" },
      { protocolVersion: "ALMANAC/2" },
      { scope: "PROJECT" as const },
      { receipt: { changed: true } },
      { userId: otherUserId },
      { idempotencyKey: "changed-client-key" },
    ]) {
      await expect(prisma.almanacImport.update({ where: { id: importId }, data })).rejects.toThrow();
    }

    const undoneAt = new Date("2026-08-13T00:00:00.000Z");
    await expect(
      prisma.almanacImport.update({ where: { id: importId }, data: { undoneAt } }),
    ).resolves.toMatchObject({ undoneAt });
    await expect(
      prisma.almanacImport.update({ where: { id: importId }, data: { undoneAt } }),
    ).resolves.toMatchObject({ undoneAt });
    await expect(
      prisma.almanacImport.update({
        where: { id: importId },
        data: { undoneAt: new Date("2026-08-14T00:00:00.000Z") },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.almanacUpdate.update({ where: { id: update.id }, data: { text: "Rewritten history" } }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacUpdate.update({ where: { id: update.id }, data: { userId: otherUserId } }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacPlace.update({ where: { id: place.id }, data: { name: "Renamed history" } }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacPlace.update({ where: { id: place.id }, data: { slot: place.slot + 1 } }),
    ).rejects.toThrow();

    await expect(
      prisma.almanacImport.create({
        data: {
          userId,
          idempotencyKey: "invariants-client",
          protocolVersion: "ALMANAC/1",
          scope: "CHAT",
          rawPacket: "ALMANAC/1\nscope: chat\nOther | NOW | Other.",
          receipt: {},
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.almanacPlace.create({
        data: { userId, name: "TEST ARCHIVE", normalisedName: "test archive", slot: place.slot + 1 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.almanacPlace.create({
        data: { userId, name: "Different", normalisedName: "different", slot: place.slot },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces lineage and target-date integrity at the database boundary", async () => {
    const userId = await createUser("record-repair-invariants");
    const studio = await commitAlmanacImport(
      userId,
      input("record-repair-invariants-a", [
        "Studio | NOW | Sessions happen monthly.",
        "Studio | NOW | Sessions happen weekly.",
      ]),
    );
    const career = await commitAlmanacImport(
      userId,
      input("record-repair-invariants-b", ["Career | NOW | Seeking a new role."]),
    );
    const predecessors = studio.atlas.updates
      .filter((update) => update.importId === studio.import.id)
      .map((update) => update.id);
    const resolved = await createDirectAlmanacSubjectUpdate(
      userId,
      studio.atlas.places.find((place) => place.name === "Studio")!.id,
      {
        idempotencyKey: "record-repair-invariants-direct",
        action: "resolution",
        state: "NOW",
        statement: "Sessions happen fortnightly.",
        supersedesUpdateIds: predecessors,
      },
    );

    await expect(
      prisma.almanacUpdateSupersession.update({
        where: {
          successorUpdateId_predecessorUpdateId: {
            successorUpdateId: resolved.updateId,
            predecessorUpdateId: predecessors[0]!,
          },
        },
        data: { createdAt: new Date("2026-09-02T00:00:00.000Z") },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacUpdateSupersession.create({
        data: {
          userId,
          successorUpdateId: resolved.updateId,
          predecessorUpdateId: resolved.updateId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacUpdateSupersession.create({
        data: {
          userId,
          successorUpdateId: resolved.updateId,
          predecessorUpdateId: career.atlas.updates.find(
            (update) => update.importId === career.import.id,
          )!.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacUpdatePreference.create({
        data: {
          userId,
          updateId: career.atlas.updates.find(
            (update) => update.importId === career.import.id,
          )!.id,
          targetDate: new Date("2027-01-01T00:00:00.000Z"),
          targetDatePrecision: "YEAR",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.almanacUpdatePreference.create({
        data: {
          userId,
          updateId: career.atlas.updates.find(
            (update) => update.importId === career.import.id,
          )!.id,
          targetDatePrecision: "YEAR",
        },
      }),
    ).rejects.toThrow();
  });

  it("commits mixed judgement atomically and returns the same Import on retry", async () => {
    const userId = await createUser("mixed");
    const request = input(
      "mixed-client-import",
      [
        "Studio | NOW | Weekly sessions are active.",
        "Community garden | NEXT | Follow generic AI advice.",
      ],
      [
        { lineNumber: 3, accepted: true },
        { lineNumber: 4, accepted: false },
      ],
    );
    const first = await commitAlmanacImport(userId, request);
    const retry = await commitAlmanacImport(userId, {
      ...request,
      decisions: [...request.decisions].reverse(),
    });
    expect(first.disposition).toBe("created");
    expect(retry).toMatchObject({ disposition: "idempotent_retry", import: { id: first.import.id } });
    expect(first.import.receipt.importRequest).toEqual({
      version: 1,
      decisions: [
        {
          lineNumber: 3,
          accepted: true,
          placeId: null,
          supersedesUpdateId: null,
          subjectName: null,
          state: null,
          statement: null,
        },
        {
          lineNumber: 4,
          accepted: false,
          placeId: null,
          supersedesUpdateId: null,
          subjectName: null,
          state: null,
          statement: null,
        },
      ],
    });
    expect(first.import.receipt.counts).toMatchObject({ accepted: 1, rejected: 1 });
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(1);
  });

  it("rejects an idempotency retry when accept and reject decisions changed", async () => {
    const userId = await createUser("decision-idempotency");
    const request = input(
      "decision-idempotency-key",
      [
        "Studio | NOW | Weekly sessions are active.",
        "Community garden | NEXT | Join the spring rota.",
      ],
      [
        { lineNumber: 3, accepted: true },
        { lineNumber: 4, accepted: false },
      ],
    );
    const first = await commitAlmanacImport(userId, request);

    await expect(
      commitAlmanacImport(userId, {
        ...request,
        decisions: [
          { lineNumber: 3, accepted: true },
          { lineNumber: 4, accepted: true },
        ],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(1);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(1);
    expect(first.atlas.places.map((place) => place.name)).toEqual(["Studio"]);
  });

  it("fails closed for a legacy idempotency receipt that cannot prove the original decisions", async () => {
    const userId = await createUser("legacy-idempotency-receipt");
    const request = input(
      "legacy-idempotency-key",
      ["Studio | NOW | Weekly sessions are active."],
    );
    await prisma.almanacImport.create({
      data: {
        userId,
        idempotencyKey: request.idempotencyKey,
        protocolVersion: "ALMANAC/1",
        scope: "CHAT",
        rawPacket: request.rawPacket,
        receipt: {
          version: 1,
          lines: [{ lineNumber: 3, outcome: "accepted", reason: "accepted" }],
          counts: { accepted: 1, rejected: 0, newPlaces: 1, duplicates: 0, invalid: 0 },
        },
      },
    });

    await expect(commitAlmanacImport(userId, request))
      .rejects.toBeInstanceOf(AlmanacConflictError);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(0);
  });

  it("rejects idempotency retries with changed correction or supersession decisions", async () => {
    const userId = await createUser("corrected-decision-idempotency");
    const baseline = await commitAlmanacImport(
      userId,
      input("corrected-decision-baseline", [
        "Studio | OPEN | Consider weekday sessions.",
        "Studio | OPEN | Consider weekend sessions.",
      ]),
    );
    const subject = baseline.atlas.places[0]!;
    const [weekday, weekend] = baseline.atlas.updates;
    const request = {
      ...input("corrected-decision-key", [
        "Studio | NOW | Weekly sessions are active.",
      ]),
      decisions: [{
        lineNumber: 3,
        accepted: true,
        placeId: subject.id,
        supersedesUpdateId: weekday!.id,
        state: "NOW" as const,
        statement: "Sessions run every Thursday.",
      }],
    };
    await commitAlmanacImport(userId, request);

    await expect(
      commitAlmanacImport(userId, {
        ...request,
        decisions: [{
          ...request.decisions[0]!,
          statement: "Sessions happen every Thursday.",
        }],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);
    await expect(
      commitAlmanacImport(userId, {
        ...request,
        decisions: [{
          ...request.decisions[0]!,
          supersedesUpdateId: weekend!.id,
        }],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(2);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(3);
    expect((await loadAlmanacAtlas(userId)).updates.find((update) => update.id === weekend!.id))
      .toMatchObject({ current: true });
  });

  it("rolls back newly created Places and the entire Import on injected failure", async () => {
    const userId = await createUser("rollback");
    await expect(
      commitAlmanacImport(
        userId,
        input("rollback-client", ["New studio | NOW | The studio is active."]),
        { afterPlacesResolved: () => { throw new Error("injected failure"); } },
      ),
    ).rejects.toThrow("injected failure");
    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(0);
    expect(await prisma.almanacPlace.count({ where: { userId } })).toBe(0);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(0);
  });

  it("enriches one stable Place across Imports, supersedes explicitly and restores on undo", async () => {
    const userId = await createUser("history");
    const first = await commitAlmanacImport(
      userId,
      input("history-client-a", ["Studio | NOW | Monthly sessions are active."]),
    );
    const place = first.atlas.places[0]!;
    const oldUpdate = first.atlas.updates[0]!;
    const second = await commitAlmanacImport(userId, {
      ...input("history-client-b", ["Studio | NOW | Weekly sessions are active."]),
      decisions: [{ lineNumber: 3, accepted: true, supersedesUpdateId: oldUpdate.id }],
    });
    expect(second.atlas.places[0]).toMatchObject({ id: place.id, slot: place.slot });
    expect(second.atlas.updates.find((update) => update.id === oldUpdate.id)).toMatchObject({ current: false });

    const undone = await undoAlmanacImport(userId, second.import.id);
    expect(undone.atlas.updates.find((update) => update.id === oldUpdate.id)).toMatchObject({ current: true });
    expect(undone.atlas.places[0]).toMatchObject({ id: place.id, slot: place.slot });
    expect((await undoAlmanacImport(userId, second.import.id)).disposition).toBe("already_undone");
  });

  it("supersedes an earlier state explicitly and restores it on undo", async () => {
    const userId = await createUser("cross-state-history");
    const first = await commitAlmanacImport(
      userId,
      input("cross-state-client-a", ["Studio | OPEN | Consider weekly sessions."]),
    );
    const earlier = first.atlas.updates[0]!;

    const second = await commitAlmanacImport(userId, {
      ...input("cross-state-client-b", ["Studio | NOW | Weekly sessions are active."]),
      decisions: [{ lineNumber: 3, accepted: true, supersedesUpdateId: earlier.id }],
    });
    const incoming = second.atlas.updates.find(
      (update) => update.importId === second.import.id,
    )!;

    expect(incoming).toMatchObject({
      state: "NOW",
      supersedesUpdateId: earlier.id,
      supersedesUpdateIds: [earlier.id],
      current: true,
    });
    expect(second.atlas.updates.find((update) => update.id === earlier.id)).toMatchObject({
      state: "OPEN",
      supersededByUpdateId: incoming.id,
      current: false,
    });
    expect(
      await prisma.almanacUpdateSupersession.findMany({
        where: { userId, successorUpdateId: incoming.id },
        select: { predecessorUpdateId: true },
      }),
    ).toEqual([{ predecessorUpdateId: earlier.id }]);

    const undone = await undoAlmanacImport(userId, second.import.id);
    expect(undone.atlas.updates.find((update) => update.id === earlier.id)).toMatchObject({
      current: true,
      supersededByUpdateId: null,
    });
  });

  it("rejects incompatible, cross-Subject and undone supersession targets", async () => {
    const userId = await createUser("cross-state-guards");
    const first = await commitAlmanacImport(
      userId,
      input("cross-state-guards-a", [
        "Studio | DONE | Opened the studio.",
        "Career | NOW | Working in mortgage advice.",
        "Archive | OPEN | Consider cataloguing the papers.",
      ]),
    );
    const completed = first.atlas.updates.find((update) => update.state === "DONE")!;
    const career = first.atlas.updates.find((update) => update.state === "NOW")!;
    const archive = first.atlas.updates.find((update) => update.state === "OPEN")!;

    await expect(
      commitAlmanacImport(userId, {
        ...input("cross-state-guards-b", ["Studio | OPEN | Reconsider the opening."]),
        decisions: [{ lineNumber: 3, accepted: true, supersedesUpdateId: completed.id }],
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);

    await expect(
      commitAlmanacImport(userId, {
        ...input("cross-state-guards-c", ["Studio | DONE | Finished the career change."]),
        decisions: [{ lineNumber: 3, accepted: true, supersedesUpdateId: career.id }],
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);

    await undoAlmanacImport(userId, first.import.id);
    await expect(
      commitAlmanacImport(userId, {
        ...input("cross-state-guards-d", ["Archive | NOW | Cataloguing is active."]),
        decisions: [{ lineNumber: 3, accepted: true, supersedesUpdateId: archive.id }],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);
  });

  it("rejects two successors for one earlier Update and rolls back the whole Import", async () => {
    const userId = await createUser("duplicate-supersession-target");
    const first = await commitAlmanacImport(
      userId,
      input("duplicate-supersession-target-a", ["Studio | OPEN | Consider weekly sessions."]),
    );
    const earlier = first.atlas.updates[0]!;

    await expect(
      commitAlmanacImport(userId, {
        ...input("duplicate-supersession-target-b", [
          "Studio | NOW | Weekly evening sessions are active.",
          "Studio | NOW | Weekly weekend sessions are active.",
        ]),
        decisions: [
          { lineNumber: 3, accepted: true, supersedesUpdateId: earlier.id },
          { lineNumber: 4, accepted: true, supersedesUpdateId: earlier.id },
        ],
      }),
    ).rejects.toThrow(
      "One earlier Update cannot be superseded more than once in the same Import.",
    );

    expect(
      await prisma.almanacImport.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: "duplicate-supersession-target-b",
          },
        },
      }),
    ).toBeNull();
    expect(
      await prisma.almanacUpdate.count({
        where: { userId, supersedesUpdateId: earlier.id },
      }),
    ).toBe(0);
    expect((await loadAlmanacAtlas(userId)).updates.find((update) => update.id === earlier.id)).toMatchObject({
      current: true,
      supersededByUpdateId: null,
    });
  });

  it("reviews an undone response again as a new immutable Import", async () => {
    const userId = await createUser("review-again");
    const originalInput = input(
      "review-again-client-a",
      ["Studio | NOW | Weekly sessions are active."],
    );
    const first = await commitAlmanacImport(userId, originalInput);
    const placeId = first.atlas.places[0]!.id;

    await undoAlmanacImport(userId, first.import.id);
    const reviewedAgain = await commitAlmanacImport(userId, {
      ...originalInput,
      idempotencyKey: "review-again-client-b",
    });

    expect(reviewedAgain.disposition).toBe("created");
    expect(reviewedAgain.import.id).not.toBe(first.import.id);
    expect(reviewedAgain.import.rawPacket).toBe(first.import.rawPacket);
    expect(reviewedAgain.atlas.places[0]).toMatchObject({ id: placeId, active: true });
    expect(reviewedAgain.atlas.updates.filter((update) => update.active)).toHaveLength(1);
    expect((await loadAlmanacImport(userId, first.import.id)).undoneAt).not.toBeNull();
  });

  it("undoing an older Import preserves later active enrichment and its Place", async () => {
    const userId = await createUser("older-undo");
    const first = await commitAlmanacImport(
      userId,
      input("older-client-a", ["Local archive | NOW | The archive is catalogued."]),
    );
    await commitAlmanacImport(
      userId,
      input("older-client-b", ["Local archive | NEXT | Publish the first collection."]),
    );
    const result = await undoAlmanacImport(userId, first.import.id);
    expect(result.atlas.places).toHaveLength(1);
    expect(result.atlas.updates.filter((update) => update.active)).toHaveLength(1);
  });

  it("prevents cross-owner reads and concurrent duplicate normalised Places", async () => {
    const userA = await createUser("owner-a");
    const userB = await createUser("owner-b");
    const committed = await commitAlmanacImport(
      userA,
      input("owner-client", ["Home workshop | NOW | Tools are organised."]),
    );
    await expect(loadAlmanacImport(userB, committed.import.id)).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(loadAlmanacPlace(userB, committed.atlas.places[0]!.id)).rejects.toBeInstanceOf(AlmanacNotFoundError);
    expect(await loadAlmanacAtlas(userB)).toEqual({
      places: [],
      updates: [],
      imports: [],
      subjectPreferences: [],
      updatePreferences: [],
    });

    const snapshotUser = await createUser("projection-snapshot");
    let releaseSnapshot!: () => void;
    let markSnapshotReady!: () => void;
    const holdSnapshot = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    const snapshotReady = new Promise<void>((resolve) => { markSnapshotReady = resolve; });
    const concurrentRead = loadAlmanacAtlas(snapshotUser, {
      afterPlacesLoaded: async () => {
        markSnapshotReady();
        await holdSnapshot;
      },
    });
    await snapshotReady;
    try {
      await commitAlmanacImport(
        snapshotUser,
        input("snapshot-concurrent-write", ["Snapshot subject | NOW | The write completed during the read."]),
      );
    } finally {
      releaseSnapshot();
    }
    expect(await concurrentRead).toEqual({
      places: [],
      updates: [],
      imports: [],
      subjectPreferences: [],
      updatePreferences: [],
    });
    const afterSnapshot = await loadAlmanacAtlas(snapshotUser);
    expect(afterSnapshot.places).toHaveLength(1);
    expect(afterSnapshot.updates).toHaveLength(1);
    expect(afterSnapshot.imports).toHaveLength(1);

    let releaseFirst!: () => void;
    let markFirstReady!: () => void;
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstReady = new Promise<void>((resolve) => { markFirstReady = resolve; });
    const firstConcurrent = commitAlmanacImport(
      userB,
      input("concurrent-a", ["Studio | NOW | Sessions are active."]),
      {
        afterPlacesResolved: async () => {
          markFirstReady();
          await holdFirst;
        },
      },
    );
    await firstReady;
    const secondConcurrent = commitAlmanacImport(
      userB,
      input("concurrent-b", ["  studio  | NEXT | Prepare new work."]),
    );
    const simultaneousBackends = await eventually(
      () => prisma.$queryRaw<Array<{ pid: number }>>`
        SELECT pid
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND usename = current_user
          AND pid <> pg_backend_pid()
          AND xact_start IS NOT NULL
      `,
      (rows) => new Set(rows.map((row) => row.pid)).size >= 2,
    );
    expect(new Set(simultaneousBackends.map((row) => row.pid)).size).toBeGreaterThanOrEqual(2);
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([firstConcurrent, secondConcurrent]);
    expect(firstResult.import.id).not.toBe(secondResult.import.id);
    expect(await prisma.almanacPlace.count({ where: { userId: userB } })).toBe(1);
    expect(await prisma.almanacUpdate.count({ where: { userId: userB } })).toBe(2);
  });

  it("blocks direct restricted-role access while server paths remain owner-scoped", async () => {
    const userA = await createUser("rls-a");
    const userB = await createUser("rls-b");
    const importA = await commitAlmanacImport(
      userA,
      input("rls-client-a", ["Owner A place | NOW | Owner A statement."]),
    );
    const importB = await commitAlmanacImport(
      userB,
      input("rls-client-b", ["Owner B place | NOW | Owner B statement."]),
    );

    expect((await loadAlmanacAtlas(userA)).imports.map((item) => item.id)).toEqual([importA.import.id]);
    expect((await loadAlmanacAtlas(userB)).imports.map((item) => item.id)).toEqual([importB.import.id]);
    await expect(loadAlmanacImport(userA, importB.import.id)).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(loadAlmanacPlace(userA, importB.atlas.places[0]!.id)).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(
      commitAlmanacImport(userA, {
        ...input("rls-cross-place", ["Owner A new | NEXT | Cross-owner resolution attempt."]),
        decisions: [{ lineNumber: 3, accepted: true, placeId: importB.atlas.places[0]!.id }],
      }),
    ).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(
      commitAlmanacImport(userA, {
        ...input("rls-cross-update", ["Owner A place | NOW | Cross-owner supersession attempt."]),
        decisions: [{
          lineNumber: 3,
          accepted: true,
          supersedesUpdateId: importB.atlas.updates[0]!.id,
        }],
      }),
    ).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(undoAlmanacImport(userB, importA.import.id)).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(
      prisma.almanacUpdate.create({
        data: {
          userId: userA,
          importId: importB.import.id,
          placeId: importA.atlas.places[0]!.id,
          state: "NOW",
          text: "Cross-owner Import reference.",
          normalisedFingerprint: "NOW\u001fcross-owner import reference.",
          sourceLineNumber: 99,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.almanacUpdate.create({
        data: {
          userId: userA,
          importId: importA.import.id,
          placeId: importA.atlas.places[0]!.id,
          state: "NOW",
          text: "Cross-owner supersession reference.",
          normalisedFingerprint: "NOW\u001fcross-owner supersession reference.",
          sourceLineNumber: 99,
          supersedesUpdateId: importB.atlas.updates[0]!.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.almanacUpdateSupersession.create({
        data: {
          userId: userA,
          successorUpdateId: importA.atlas.updates[0]!.id,
          predecessorUpdateId: importB.atlas.updates[0]!.id,
        },
      }),
    ).rejects.toThrow();

    await prisma.$executeRawUnsafe(
      'GRANT SELECT, INSERT ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate", "AlmanacUpdateSupersession" TO anon, authenticated',
    );
    await prisma.$executeRawUnsafe(
      'GRANT SELECT ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate", "AlmanacUpdateSupersession" TO service_role',
    );
    try {
      for (const role of ["anon", "authenticated"]) {
        await prisma.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
            'SELECT id FROM "AlmanacImport"',
          );
          expect(rows).toEqual([]);
          const edgeRows = await transaction.$queryRawUnsafe<
            Array<{ successorUpdateId: string }>
          >('SELECT "successorUpdateId" FROM "AlmanacUpdateSupersession"');
          expect(edgeRows).toEqual([]);
          await expect(
            transaction.$executeRawUnsafe(
              `INSERT INTO "AlmanacPlace" (id, "userId", name, "normalisedName", slot) VALUES ('${role}-forbidden', '${userA}', 'Forbidden', '${role}-forbidden', 63)`,
            ),
          ).rejects.toThrow();
        });
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE service_role");
        const visible = await transaction.$queryRawUnsafe<Array<{ id: string; userId: string }>>(
          `SELECT id, "userId" FROM "AlmanacImport" WHERE "userId" IN ('${userA}', '${userB}') ORDER BY id`,
        );
        expect(new Set(visible.map((row) => row.id))).toEqual(
          new Set([importA.import.id, importB.import.id]),
        );
        expect(new Set(visible.map((row) => row.userId))).toEqual(new Set([userA, userB]));
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'REVOKE ALL PRIVILEGES ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate", "AlmanacUpdateSupersession" FROM anon, authenticated, service_role',
      );
    }
  });

  it("uses separate simultaneous transactions and returns one result for one idempotency key", async () => {
    const userId = await createUser("concurrent-idempotency");
    const request = input(
      "same-idempotency-key",
      ["Shared studio | NOW | The studio is open."],
    );
    let releaseFirst!: () => void;
    let markFirstReady!: () => void;
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstReady = new Promise<void>((resolve) => { markFirstReady = resolve; });
    const first = commitAlmanacImport(userId, request, {
      afterPlacesResolved: async () => {
        markFirstReady();
        await holdFirst;
      },
    });
    await firstReady;
    const second = commitAlmanacImport(userId, request);

    const simultaneousBackends = await eventually(
      () => prisma.$queryRaw<Array<{ pid: number }>>`
        SELECT pid
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND usename = current_user
          AND pid <> pg_backend_pid()
          AND xact_start IS NOT NULL
      `,
      (rows) => new Set(rows.map((row) => row.pid)).size >= 2,
    );
    expect(new Set(simultaneousBackends.map((row) => row.pid)).size).toBeGreaterThanOrEqual(2);
    releaseFirst();
    const [left, right] = await Promise.all([first, second]);
    expect(left.import.id).toBe(right.import.id);
    expect(new Set([left.disposition, right.disposition])).toEqual(
      new Set(["created", "idempotent_retry"]),
    );
    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(1);
    expect(await prisma.almanacPlace.count({ where: { userId } })).toBe(1);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(1);
  });

  it("serialises the same idempotency key and rejects concurrent divergent decisions", async () => {
    const userId = await createUser("concurrent-divergent-idempotency");
    const baseRequest = input(
      "same-key-divergent-decisions",
      [
        "Studio | NOW | The studio is open.",
        "Community garden | NOW | The garden is open.",
      ],
    );
    let releaseFirst!: () => void;
    let markFirstReady!: () => void;
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstReady = new Promise<void>((resolve) => { markFirstReady = resolve; });
    const first = commitAlmanacImport(
      userId,
      {
        ...baseRequest,
        decisions: [
          { lineNumber: 3, accepted: true },
          { lineNumber: 4, accepted: false },
        ],
      },
      {
        afterPlacesResolved: async () => {
          markFirstReady();
          await holdFirst;
        },
      },
    );
    await firstReady;
    const second = commitAlmanacImport(userId, {
      ...baseRequest,
      decisions: [
        { lineNumber: 3, accepted: false },
        { lineNumber: 4, accepted: true },
      ],
    });

    try {
      const simultaneousBackends = await eventually(
        () => prisma.$queryRaw<Array<{ pid: number }>>`
          SELECT pid
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND usename = current_user
            AND pid <> pg_backend_pid()
            AND xact_start IS NOT NULL
        `,
        (rows) => new Set(rows.map((row) => row.pid)).size >= 2,
      );
      expect(new Set(simultaneousBackends.map((row) => row.pid)).size)
        .toBeGreaterThanOrEqual(2);
    } finally {
      releaseFirst();
    }

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);
    expect(firstResult.status).toBe("fulfilled");
    expect(secondResult.status).toBe("rejected");
    if (secondResult.status === "rejected") {
      expect(secondResult.reason).toBeInstanceOf(AlmanacConflictError);
    }
    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(1);
    expect(await prisma.almanacUpdate.findMany({
      where: { userId },
      select: { text: true },
    })).toEqual([{ text: "The studio is open." }]);
  });

  it("persists every mixed line outcome and only creates accepted Updates", async () => {
    const userId = await createUser("mixed-outcomes");
    await commitAlmanacImport(
      userId,
      input("mixed-baseline", ["Existing place | NOW | Baseline is active."]),
    );
    const rawPacket = [
      "ALMANAC/1",
      "scope: chat",
      "Existing place | NEXT | Prepare the next session.",
      "New place | NOW | A durable new subject is active.",
      "Rejected place | OPEN | Consider a disposable option.",
      "Existing place | NOW | Baseline is active.",
      "This line is invalid",
    ].join("\n");
    const result = await commitAlmanacImport(userId, {
      idempotencyKey: "mixed-outcomes-client",
      rawPacket,
      decisions: [
        { lineNumber: 3, accepted: true },
        { lineNumber: 4, accepted: true },
        { lineNumber: 5, accepted: false },
      ],
    });
    expect(result.import.rawPacket).toBe(rawPacket);
    expect(result.import.receipt.counts).toEqual({
      accepted: 2,
      rejected: 1,
      newPlaces: 1,
      duplicates: 1,
      invalid: 1,
    });
    expect(result.import.receipt.lines.map((line) => [line.lineNumber, line.outcome])).toEqual([
      [3, "accepted"],
      [4, "accepted"],
      [5, "rejected"],
      [6, "duplicate"],
      [7, "invalid"],
    ]);
    expect(await prisma.almanacUpdate.count({ where: { importId: result.import.id } })).toBe(2);
    const undone = await undoAlmanacImport(userId, result.import.id);
    expect(undone.import.rawPacket).toBe(rawPacket);
    expect(undone.atlas.updates.filter((update) => update.importId === result.import.id && update.active)).toEqual([]);
  });

  it("keeps the raw response immutable while persisting the user's corrected values", async () => {
    const userId = await createUser("review-correction");
    const rawPacket = [
      "ALMANAC/1",
      "scope: chat",
      "Housing | NOW | Plans to transfer the flat in 2027.",
    ].join("\n");
    const result = await commitAlmanacImport(userId, {
      idempotencyKey: "review-correction-client",
      rawPacket,
      decisions: [{
        lineNumber: 3,
        accepted: true,
        subjectName: "Dartford flat",
        state: "NEXT",
        statement: "Transfer full ownership on 1 June 2027.",
      }],
    });

    expect(result.import.rawPacket).toBe(rawPacket);
    expect(result.atlas.places).toContainEqual(
      expect.objectContaining({ name: "Dartford flat" }),
    );
    expect(result.atlas.updates).toContainEqual(
      expect.objectContaining({
        sourceLineNumber: 3,
        state: "NEXT",
        statement: "Transfer full ownership on 1 June 2027.",
      }),
    );
  });

  it("creates an exact user-authored correction with truthful provenance and idempotency", async () => {
    const userId = await createUser("direct-correction");
    const baseline = await commitAlmanacImport(
      userId,
      input("direct-correction-source", [
        "Studio | NOW | Monthly sessions are active.",
        "Studio | NEXT | Prepare the autumn programme.",
      ]),
    );
    const subject = baseline.atlas.places[0]!;
    const earlier = baseline.atlas.updates.find((update) => update.state === "NOW")!;
    const standard = baseline.atlas.updates.find((update) => update.state === "NEXT")!;
    const statement = "  Weekly sessions are active, exactly as written.  ";
    const request = {
      idempotencyKey: "direct-correction-001",
      action: "correction" as const,
      state: "NOW" as const,
      statement,
      supersedesUpdateIds: [earlier.id],
      curation: { significance: "KEY" as const },
    };

    const created = await createDirectAlmanacSubjectUpdate(userId, subject.id, request);
    const retry = await createDirectAlmanacSubjectUpdate(userId, subject.id, request);

    expect(created).toMatchObject({
      disposition: "created",
      scope: "direct",
      originKind: "USER_ENTRY",
      supersedesUpdateIds: [earlier.id],
      curation: { hidden: false, significance: "KEY", targetDate: null },
      atlas: expect.any(Object),
    });
    expect(retry).toMatchObject({
      disposition: "idempotent_retry",
      importId: created.importId,
      updateId: created.updateId,
      scope: "direct",
      originKind: "USER_ENTRY",
    });
    const source = created.atlas.imports.find((item) => item.id === created.importId)!;
    expect(source).toMatchObject({
      protocolVersion: "ALMANAC/USER/1",
      scope: "direct",
      originKind: "USER_ENTRY",
      rawPacket: `ALMANAC/USER/1\naction: correction\n${statement}`,
      receipt: {
        directRequest: {
          subjectId: subject.id,
          action: "correction",
          state: "NOW",
          statement,
          supersedesUpdateIds: [earlier.id],
          curation: { significance: "KEY", targetDate: null },
        },
      },
    });
    expect(created.atlas.updates.find((update) => update.id === created.updateId)).toMatchObject({
      statement,
      sourceLineNumber: 3,
      supersedesUpdateId: earlier.id,
      supersedesUpdateIds: [earlier.id],
      originKind: "USER_ENTRY",
      current: true,
    });
    expect(created.atlas.updates.find((update) => update.id === standard.id)).toMatchObject({
      curation: { significance: "STANDARD" },
      current: true,
    });
    expect(created.atlas.places[0]).toMatchObject({ hasActiveKeyUpdate: true });
    expect((await loadAlmanacImport(userId, baseline.import.id)).updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: earlier.id, current: false }),
        expect.objectContaining({ id: standard.id, current: true }),
      ]),
    );
    expect((await loadAlmanacImport(userId, created.importId)).updates[0]).toMatchObject({
      id: created.updateId,
      originKind: "USER_ENTRY",
      current: true,
    });
    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        ...request,
        statement: "A different correction using the same key.",
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    const destinationImport = await commitAlmanacImport(
      userId,
      input("direct-correction-destination", ["Creative work | NOW | Writing is active."]),
    );
    const destination = destinationImport.atlas.places.find(
      (place) => place.name === "Creative work",
    )!;
    await mergeAlmanacSubjects(userId, {
      sourceSubjectId: subject.id,
      targetSubjectId: destination.id,
      displayName: "Creative practice",
    });
    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, request),
    ).resolves.toMatchObject({
      disposition: "idempotent_retry",
      importId: created.importId,
      updateId: created.updateId,
    });
    await expect(
      createDirectAlmanacSubjectUpdate(userId, destination.id, request),
    ).rejects.toBeInstanceOf(AlmanacConflictError);
  });

  it("resolves several explicitly selected current Updates and revives all of them on undo", async () => {
    const userId = await createUser("direct-resolution");
    const baseline = await commitAlmanacImport(
      userId,
      input("direct-resolution-source", [
        "Studio | NOW | Sessions happen monthly.",
        "Studio | NOW | Sessions happen weekly.",
        "Studio | NOW | Sessions happen fortnightly.",
      ]),
    );
    const subject = baseline.atlas.places[0]!;
    const selected = baseline.atlas.updates.filter(
      (update) => update.statement !== "Sessions happen fortnightly.",
    );
    const earlierIds = selected.map((update) => update.id).sort();
    const nonSelected = baseline.atlas.updates.find(
      (update) => update.statement === "Sessions happen fortnightly.",
    )!;

    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-resolution-non-selected-duplicate",
        action: "resolution",
        state: "NOW",
        statement: nonSelected.statement,
        supersedesUpdateIds: earlierIds,
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);
    expect(
      await prisma.almanacImport.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: "direct-resolution-non-selected-duplicate",
          },
        },
      }),
    ).toBeNull();

    const resolved = await createDirectAlmanacSubjectUpdate(userId, subject.id, {
      idempotencyKey: "direct-resolution-001",
      action: "resolution",
      state: "NOW",
      statement: "Sessions happen weekly.",
      supersedesUpdateIds: [...earlierIds].reverse(),
    });

    expect(resolved.supersedesUpdateIds).toEqual(earlierIds);
    expect(resolved.atlas.updates.find((update) => update.id === resolved.updateId)).toMatchObject({
      supersedesUpdateId: null,
      supersedesUpdateIds: earlierIds,
      statement: "Sessions happen weekly.",
      originKind: "USER_ENTRY",
      current: true,
    });
    for (const earlierId of earlierIds) {
      expect(resolved.atlas.updates.find((update) => update.id === earlierId)).toMatchObject({
        supersededByUpdateId: resolved.updateId,
        supersededByUpdateIds: [resolved.updateId],
        current: false,
      });
    }
    expect(resolved.atlas.updates.find((update) => update.id === nonSelected.id)).toMatchObject({
      current: true,
      supersededByUpdateIds: [],
    });
    expect(
      await prisma.almanacUpdateSupersession.findMany({
        where: { successorUpdateId: resolved.updateId },
        orderBy: { predecessorUpdateId: "asc" },
        select: { predecessorUpdateId: true },
      }),
    ).toEqual(earlierIds.map((predecessorUpdateId) => ({ predecessorUpdateId })));
    await expect(undoAlmanacImport(userId, baseline.import.id)).rejects.toBeInstanceOf(
      AlmanacConflictError,
    );

    const undone = await undoAlmanacImport(userId, resolved.importId);
    expect(undone.atlas.updates.find((update) => update.id === resolved.updateId)).toMatchObject({
      active: false,
      current: false,
    });
    for (const earlierId of earlierIds) {
      expect(undone.atlas.updates.find((update) => update.id === earlierId)).toMatchObject({
        supersededByUpdateId: null,
        supersededByUpdateIds: [],
        current: true,
      });
    }
  });

  it("enforces direct action ownership, target state, visibility and currentness", async () => {
    const userId = await createUser("direct-guards");
    const otherUserId = await createUser("direct-guards-other");
    const baseline = await commitAlmanacImport(
      userId,
      input("direct-guards-source", [
        "Studio | OPEN | Consider weekly sessions.",
        "Studio | DONE | Opened the original studio.",
        "Studio | NOW | Sessions are active.",
      ]),
    );
    const subject = baseline.atlas.places[0]!;
    const open = baseline.atlas.updates.find((update) => update.state === "OPEN")!;
    const done = baseline.atlas.updates.find((update) => update.state === "DONE")!;
    const now = baseline.atlas.updates.find((update) => update.state === "NOW")!;

    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-identical-correction",
        action: "correction",
        state: "NOW",
        statement: now.statement,
        supersedesUpdateIds: [now.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    await expect(
      createDirectAlmanacSubjectUpdate(otherUserId, subject.id, {
        idempotencyKey: "direct-owner-guard",
        action: "correction",
        state: "NOW",
        statement: "Cross-owner correction.",
        supersedesUpdateIds: [now.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacNotFoundError);
    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-outcome-guard",
        action: "outcome",
        state: "DONE",
        statement: "This is not an open-question outcome.",
        supersedesUpdateIds: [done.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-state-matrix",
        action: "resolution",
        state: "NOW",
        statement: "An invalid mixed-state resolution.",
        supersedesUpdateIds: [now.id, done.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
    expect(
      await prisma.almanacImport.findUnique({
        where: {
          userId_idempotencyKey: { userId, idempotencyKey: "direct-state-matrix" },
        },
      }),
    ).toBeNull();

    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-compatible-mixed-state",
        action: "resolution",
        state: "DONE",
        statement: "Directionally compatible states still cannot form one resolution group.",
        supersedesUpdateIds: [now.id, open.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
    expect(
      await prisma.almanacImport.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: "direct-compatible-mixed-state",
          },
        },
      }),
    ).toBeNull();

    await updateAlmanacUpdatePreference(userId, done.id, { hidden: true });
    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-hidden-guard",
        action: "correction",
        state: "DONE",
        statement: "A hidden target must not be silently replaced.",
        supersedesUpdateIds: [done.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    const outcome = await createDirectAlmanacSubjectUpdate(userId, subject.id, {
      idempotencyKey: "direct-valid-outcome",
      action: "outcome",
      state: "NEXT",
      statement: "Weekly sessions were chosen.",
      supersedesUpdateIds: [open.id],
      curation: {
        significance: "KEY",
        targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
      },
    });
    expect(outcome.curation).toEqual({
      hidden: false,
      significance: "KEY",
      targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
    });
    expect(outcome.atlas.updates.find((update) => update.id === open.id)?.current).toBe(false);
    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "direct-already-superseded",
        action: "outcome",
        state: "DONE",
        statement: "A second outcome must fail.",
        supersedesUpdateIds: [open.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);
  });

  it("requires an archived Subject to be restored before AI or direct Updates are added", async () => {
    const userId = await createUser("archived-subject-write-guard");
    const baseline = await commitAlmanacImport(
      userId,
      input("archived-subject-baseline", ["Studio | NOW | Sessions are active."]),
    );
    const subject = baseline.atlas.places[0]!;
    const current = baseline.atlas.updates[0]!;
    await updateAlmanacSubject(userId, subject.id, { archived: true });

    await expect(
      createDirectAlmanacSubjectUpdate(userId, subject.id, {
        idempotencyKey: "archived-subject-direct-write",
        action: "correction",
        state: "NOW",
        statement: "Sessions now happen twice weekly.",
        supersedesUpdateIds: [current.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    await expect(
      commitAlmanacImport(userId, {
        ...input("archived-subject-ai-write", ["Studio | NOW | Sessions now happen twice weekly."]),
        decisions: [{ lineNumber: 3, accepted: true, placeId: subject.id }],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(1);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(1);
  });

  it("serialises concurrent direct repairs so only one can replace a current Update", async () => {
    const userId = await createUser("direct-concurrency");
    const baseline = await commitAlmanacImport(
      userId,
      input("direct-concurrency-source", ["Studio | NOW | Sessions are monthly."]),
    );
    const subject = baseline.atlas.places[0]!;
    const earlier = baseline.atlas.updates[0]!;
    let releaseFirst!: () => void;
    let markFirstReady!: () => void;
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstReady = new Promise<void>((resolve) => { markFirstReady = resolve; });
    const first = createDirectAlmanacSubjectUpdate(
      userId,
      subject.id,
      {
        idempotencyKey: "direct-concurrent-a",
        action: "correction",
        state: "NOW",
        statement: "Sessions are weekly.",
        supersedesUpdateIds: [earlier.id],
      },
      {
        afterTargetsValidated: async () => {
          markFirstReady();
          await holdFirst;
        },
      },
    );
    await firstReady;
    const second = createDirectAlmanacSubjectUpdate(userId, subject.id, {
      idempotencyKey: "direct-concurrent-b",
      action: "correction",
      state: "NOW",
      statement: "Sessions are fortnightly.",
      supersedesUpdateIds: [earlier.id],
    });
    await eventually(
      () => prisma.$queryRaw<Array<{ pid: number }>>`
        SELECT pid
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND usename = current_user
          AND pid <> pg_backend_pid()
          AND xact_start IS NOT NULL
      `,
      (rows) => new Set(rows.map((row) => row.pid)).size >= 2,
    );
    releaseFirst();

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);
    expect(firstResult.status).toBe("fulfilled");
    expect(secondResult.status).toBe("rejected");
    if (secondResult.status === "rejected") {
      expect(secondResult.reason).toBeInstanceOf(AlmanacConflictError);
    }
    expect(
      await prisma.almanacUpdateSupersession.count({
        where: { userId, predecessorUpdateId: earlier.id },
      }),
    ).toBe(1);
  });

  it("patches curation fields independently and keeps partial dates locale-neutral", async () => {
    const userId = await createUser("direct-curation");
    const baseline = await commitAlmanacImport(
      userId,
      input("direct-curation-source", [
        "Studio | NEXT | Prepare the March programme.",
        "Studio | NOW | Sessions are active.",
      ]),
    );
    const next = baseline.atlas.updates.find((update) => update.state === "NEXT")!;
    const now = baseline.atlas.updates.find((update) => update.state === "NOW")!;

    const dated = await updateAlmanacUpdatePreference(userId, next.id, {
      significance: "KEY",
      targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
    });
    expect(dated.curation).toEqual({
      hidden: false,
      significance: "KEY",
      targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
    });
    const hidden = await updateAlmanacUpdatePreference(userId, next.id, { hidden: true });
    expect(hidden.curation).toEqual({
      hidden: true,
      significance: "KEY",
      targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
    });
    const standard = await updateAlmanacUpdatePreference(userId, next.id, {
      significance: "STANDARD",
    });
    expect(standard.curation).toEqual({
      hidden: true,
      significance: "STANDARD",
      targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
    });
    expect((await updateAlmanacUpdatePreference(userId, next.id, { targetDate: null })).curation)
      .toMatchObject({ targetDate: null });
    await expect(
      updateAlmanacUpdatePreference(userId, now.id, {
        targetDate: { precision: "YEAR", year: 2028, month: null, day: null },
      }),
    ).rejects.toBeInstanceOf(AlmanacValidationError);
  });

  it("passes the exact persisted property enrichment, reload and undo sequence", async () => {
    const userId = await createUser("property-sequence");
    const importA = await commitAlmanacImport(
      userId,
      input("property-import-a", ["Test rental property | NOW | Estimated value is £300,000."]),
    );
    const place = importA.atlas.places[0]!;
    const value300 = importA.atlas.updates[0]!;
    expect(value300.current).toBe(true);

    const importB = await commitAlmanacImport(userId, {
      ...input("property-import-b", ["Test rental property | NOW | Estimated value is £280,000."]),
      decisions: [{ lineNumber: 3, accepted: true, supersedesUpdateId: value300.id }],
    });
    const value280 = importB.atlas.updates.find((update) => update.importId === importB.import.id)!;
    expect(importB.atlas.places).toHaveLength(1);
    expect(importB.atlas.places[0]).toMatchObject({ id: place.id, slot: place.slot });
    expect(value280.current).toBe(true);
    expect(importB.atlas.updates.find((update) => update.id === value300.id)?.current).toBe(false);
    expect((await loadAlmanacImport(userId, importA.import.id)).rawPacket).toContain("£300,000");
    expect((await loadAlmanacImport(userId, importB.import.id)).rawPacket).toContain("£280,000");

    const reloaded = await loadAlmanacAtlas(userId);
    expect(reloaded.places[0]).toMatchObject({ id: place.id, slot: place.slot });
    expect(reloaded.updates.find((update) => update.id === value280.id)?.current).toBe(true);
    expect(reloaded.updates.find((update) => update.id === value300.id)?.current).toBe(false);

    const undoB = await undoAlmanacImport(userId, importB.import.id);
    expect(undoB.import.undoneAt).not.toBeNull();
    expect(undoB.atlas.updates.find((update) => update.id === value280.id)?.active).toBe(false);
    expect(undoB.atlas.updates.find((update) => update.id === value300.id)?.current).toBe(true);
    expect(undoB.atlas.places[0]).toMatchObject({ id: place.id, slot: place.slot });

    const importC = await commitAlmanacImport(
      userId,
      input("property-import-c", ["Test rental property | NOW | Rent is £1,700 pcm."]),
    );
    const rent = importC.atlas.updates.find((update) => update.importId === importC.import.id)!;
    expect(importC.atlas.places).toHaveLength(1);
    expect(importC.atlas.places[0]).toMatchObject({ id: place.id, slot: place.slot });
    expect(importC.atlas.updates.filter((update) => update.current).map((update) => update.id)).toEqual(
      expect.arrayContaining([value300.id, rent.id]),
    );

    const undoA = await undoAlmanacImport(userId, importA.import.id);
    expect(undoA.import.undoneAt).not.toBeNull();
    expect(undoA.atlas.updates.find((update) => update.id === value300.id)?.active).toBe(false);
    expect(undoA.atlas.updates.find((update) => update.id === rent.id)?.active).toBe(true);
    expect(undoA.atlas.places[0]).toMatchObject({ id: place.id, slot: place.slot });

    const undoC = await undoAlmanacImport(userId, importC.import.id);
    expect(undoC.atlas.places.find((item) => item.id === place.id)?.active).toBe(false);
    expect(undoC.atlas.updates.filter((update) => update.active)).toEqual([]);
    const retained = await prisma.almanacPlace.findUniqueOrThrow({ where: { id: place.id } });
    expect(retained.slot).toBe(place.slot);
    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(3);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(3);
  });

  it("renames, archives and reversibly combines Subject presentation without rewriting history", async () => {
    const userId = await createUser("subject-presentation");
    const career = await commitAlmanacImport(
      userId,
      input("subject-presentation-a", [
        "Mortgage adviser career | NOW | Working towards an employed adviser role.",
      ]),
    );
    const future = await commitAlmanacImport(
      userId,
      input("subject-presentation-b", [
        "Financial adviser career | NEXT | Progress towards CFP qualification.",
      ]),
    );
    const source = career.atlas.places.find((place) => place.name === "Mortgage adviser career")!;
    const target = future.atlas.places.find((place) => place.name === "Financial adviser career")!;

    const merged = await mergeAlmanacSubjects(userId, {
      sourceSubjectId: source.id,
      targetSubjectId: target.id,
      displayName: "Financial services career",
    });
    expect(merged.atlas.subjectPreferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ placeId: source.id, mergedIntoPlaceId: target.id }),
      expect.objectContaining({ placeId: target.id, displayName: "Financial services career" }),
    ]));
    expect(merged.atlas.updates).toHaveLength(2);
    expect(merged.atlas.imports.map((item) => item.rawPacket)).toEqual([
      career.import.rawPacket,
      future.import.rawPacket,
    ]);

    const organised = await updateAlmanacSubject(userId, target.id, {
      iconKey: "briefcase-business",
      archived: true,
    });
    expect(organised.atlas.subjectPreferences).toContainEqual(expect.objectContaining({
      placeId: target.id,
      iconKey: "briefcase-business",
      archivedAt: expect.any(String),
    }));

    const separated = await unmergeAlmanacSubject(userId, source.id);
    expect(separated.atlas.subjectPreferences).toContainEqual(expect.objectContaining({
      placeId: source.id,
      mergedIntoPlaceId: null,
    }));
    expect(await prisma.almanacPlace.count({ where: { userId } })).toBe(2);
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(2);
    expect(await prisma.almanacImport.count({ where: { userId } })).toBe(2);
  });

  it("does not separate a combined Subject while an active repair spans its member Places", async () => {
    const userId = await createUser("cross-place-lineage");
    const sourceImport = await commitAlmanacImport(
      userId,
      input("cross-place-lineage-a", ["Old studio | NOW | Sessions happen monthly."]),
    );
    const targetImport = await commitAlmanacImport(
      userId,
      input("cross-place-lineage-b", ["New studio | NOW | Sessions happen weekly."]),
    );
    const source = sourceImport.atlas.places.find((place) => place.name === "Old studio")!;
    const target = targetImport.atlas.places.find((place) => place.name === "New studio")!;
    const sourceUpdate = sourceImport.atlas.updates.find(
      (update) => update.importId === sourceImport.import.id,
    )!;
    const targetUpdate = targetImport.atlas.updates.find(
      (update) => update.importId === targetImport.import.id,
    )!;
    await mergeAlmanacSubjects(userId, {
      sourceSubjectId: source.id,
      targetSubjectId: target.id,
      displayName: "Studio",
    });
    const resolution = await createDirectAlmanacSubjectUpdate(userId, target.id, {
      idempotencyKey: "cross-place-resolution",
      action: "resolution",
      state: "NOW",
      statement: "Sessions happen fortnightly.",
      supersedesUpdateIds: [sourceUpdate.id, targetUpdate.id],
    });

    await expect(unmergeAlmanacSubject(userId, source.id)).rejects.toBeInstanceOf(
      AlmanacConflictError,
    );
    await undoAlmanacImport(userId, resolution.importId);
    await expect(unmergeAlmanacSubject(userId, source.id)).resolves.toMatchObject({
      atlas: {
        subjectPreferences: expect.arrayContaining([
          expect.objectContaining({ placeId: source.id, mergedIntoPlaceId: null }),
        ]),
      },
    });
  });

  it("detects an exact duplicate anywhere in the visible combined Subject", async () => {
    const userId = await createUser("combined-duplicate");
    const sourceImport = await commitAlmanacImport(
      userId,
      input("combined-duplicate-a", ["Old studio | NOW | Sessions happen monthly."]),
    );
    const targetImport = await commitAlmanacImport(
      userId,
      input("combined-duplicate-b", ["New studio | NOW | The new room is open."]),
    );
    const source = sourceImport.atlas.places.find((place) => place.name === "Old studio")!;
    const target = targetImport.atlas.places.find((place) => place.name === "New studio")!;
    await mergeAlmanacSubjects(userId, {
      sourceSubjectId: source.id,
      targetSubjectId: target.id,
      displayName: "Studio",
    });

    const targetUpdate = targetImport.atlas.updates.find(
      (update) => update.importId === targetImport.import.id,
    )!;
    await expect(
      createDirectAlmanacSubjectUpdate(userId, target.id, {
        idempotencyKey: "combined-direct-duplicate",
        action: "correction",
        state: "NOW",
        statement: "Sessions happen monthly.",
        supersedesUpdateIds: [targetUpdate.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    const committed = await commitAlmanacImport(
      userId,
      input("combined-duplicate-c", [
        "New studio | NOW | Sessions happen monthly.",
        "New studio | NEXT | Prepare the autumn programme.",
      ]),
    );

    expect(committed.import.receipt.counts).toMatchObject({ accepted: 1, duplicates: 1 });
    expect(committed.import.receipt.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ lineNumber: 3, outcome: "duplicate" }),
      expect.objectContaining({ lineNumber: 4, outcome: "accepted" }),
    ]));
  });

  it("hides and restores one Update without rewriting accepted history or its response", async () => {
    const userId = await createUser("update-visibility");
    const committed = await commitAlmanacImport(
      userId,
      input("update-visibility-a", [
        "Career | NOW | Working in mortgage advice.",
        "Career | NEXT | Progress towards financial advice.",
      ]),
    );
    const update = committed.atlas.updates[0]!;
    const rawPacket = committed.import.rawPacket;

    const hidden = await updateAlmanacUpdatePreference(userId, update.id, { hidden: true });
    expect(hidden.atlas.updatePreferences).toContainEqual(expect.objectContaining({
      updateId: update.id,
      hiddenAt: expect.any(String),
    }));
    expect(hidden.atlas.updates.find((item) => item.id === update.id)?.statement)
      .toBe(update.statement);
    expect(hidden.atlas.imports[0]?.rawPacket).toBe(rawPacket);

    const restored = await updateAlmanacUpdatePreference(userId, update.id, { hidden: false });
    expect(restored.atlas.updatePreferences).toContainEqual(expect.objectContaining({
      updateId: update.id,
      hiddenAt: null,
    }));
  });

  it("does not use a hidden Update as an exact-duplicate match", async () => {
    const userId = await createUser("hidden-duplicate");
    const line = "Career | NOW | Working in mortgage advice.";
    const first = await commitAlmanacImport(
      userId,
      input("hidden-duplicate-a", [line]),
    );
    await updateAlmanacUpdatePreference(userId, first.atlas.updates[0]!.id, { hidden: true });
    await expect(
      commitAlmanacImport(userId, {
        ...input("hidden-supersession", [
          "Career | NOW | Working in independent financial advice.",
        ]),
        decisions: [{
          lineNumber: 3,
          accepted: true,
          supersedesUpdateId: first.atlas.updates[0]!.id,
        }],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);

    const repeated = await commitAlmanacImport(
      userId,
      input("hidden-duplicate-b", [line]),
    );

    expect(repeated.import.receipt.counts).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(
      repeated.atlas.updates.filter(
        (update) => update.active && update.statement === "Working in mortgage advice.",
      ),
    ).toHaveLength(2);
  });

  it("continues to read and guard a singular-only supersession written by an older server", async () => {
    const userId = await createUser("legacy-singular-lineage");
    const first = await commitAlmanacImport(
      userId,
      input("legacy-singular-a", ["Studio | NOW | Sessions happen monthly."]),
    );
    const earlier = first.atlas.updates[0]!;
    const legacyImport = await prisma.almanacImport.create({
      data: {
        userId,
        idempotencyKey: "legacy-singular-b",
        protocolVersion: "ALMANAC/1",
        scope: "CHAT",
        rawPacket: "ALMANAC/1\nscope: chat\nStudio | NOW | Sessions happen weekly.",
        receipt: {
          version: 1,
          lines: [{ lineNumber: 3, outcome: "accepted", reason: "accepted" }],
          counts: {
            accepted: 1,
            rejected: 0,
            newPlaces: 0,
            duplicates: 0,
            invalid: 0,
          },
        },
      },
    });
    const legacySuccessor = await prisma.almanacUpdate.create({
      data: {
        userId,
        importId: legacyImport.id,
        placeId: earlier.placeId,
        state: "NOW",
        text: "Sessions happen weekly.",
        normalisedFingerprint: "NOW\u001fsessions happen weekly.",
        sourceLineNumber: 3,
        supersedesUpdateId: earlier.id,
      },
    });

    const projected = await loadAlmanacAtlas(userId);
    expect(projected.updates.find((update) => update.id === earlier.id)).toMatchObject({
      current: false,
      supersededByUpdateIds: [legacySuccessor.id],
    });
    expect(projected.updates.find((update) => update.id === legacySuccessor.id)).toMatchObject({
      supersedesUpdateId: earlier.id,
      supersedesUpdateIds: [earlier.id],
      current: true,
    });
    await expect(
      createDirectAlmanacSubjectUpdate(userId, earlier.placeId, {
        idempotencyKey: "legacy-singular-guard",
        action: "correction",
        state: "NOW",
        statement: "A conflicting second correction.",
        supersedesUpdateIds: [earlier.id],
      }),
    ).rejects.toBeInstanceOf(AlmanacConflictError);
    const undone = await undoAlmanacImport(userId, legacyImport.id);
    expect(undone.atlas.updates.find((update) => update.id === earlier.id)?.current).toBe(true);
  });

  it("preserves the populated legacy combine, cross-Place supersede and unmerge sequence", async () => {
    const userId = await createUser("legacy-cross-place-lineage");
    const sourceImport = await commitAlmanacImport(
      userId,
      input("legacy-cross-place-a", ["Old studio | NOW | Sessions happen monthly."]),
    );
    const targetImport = await commitAlmanacImport(
      userId,
      input("legacy-cross-place-b", ["New studio | NOW | The room is open."]),
    );
    const source = sourceImport.atlas.places.find((place) => place.name === "Old studio")!;
    const target = targetImport.atlas.places.find((place) => place.name === "New studio")!;
    const predecessor = sourceImport.atlas.updates.find(
      (update) => update.importId === sourceImport.import.id,
    )!;
    await mergeAlmanacSubjects(userId, {
      sourceSubjectId: source.id,
      targetSubjectId: target.id,
      displayName: "Studio",
    });
    const legacyImport = await prisma.almanacImport.create({
      data: {
        userId,
        idempotencyKey: "legacy-cross-place-c",
        protocolVersion: "ALMANAC/1",
        scope: "CHAT",
        rawPacket: "ALMANAC/1\nscope: chat\nNew studio | NOW | Sessions happen weekly.",
        receipt: {
          version: 1,
          lines: [{ lineNumber: 3, outcome: "accepted", reason: "accepted" }],
          counts: {
            accepted: 1,
            rejected: 0,
            newPlaces: 0,
            duplicates: 0,
            invalid: 0,
          },
        },
      },
    });
    const successor = await prisma.almanacUpdate.create({
      data: {
        userId,
        importId: legacyImport.id,
        placeId: target.id,
        state: "NOW",
        text: "Sessions happen weekly.",
        normalisedFingerprint: "NOW\u001fsessions happen weekly.",
        sourceLineNumber: 3,
        supersedesUpdateId: predecessor.id,
      },
    });
    await expect(unmergeAlmanacSubject(userId, source.id)).rejects.toBeInstanceOf(
      AlmanacConflictError,
    );

    // This direct preference mutation reproduces the pre-guard server's final
    // state. The forward migration backfills it before enabling new-edge checks.
    await prisma.almanacSubjectPreference.update({
      where: { placeId: source.id },
      data: { mergedIntoPlaceId: null },
    });
    const projected = await loadAlmanacAtlas(userId);
    expect(projected.updates.find((update) => update.id === predecessor.id)).toMatchObject({
      current: false,
      supersededByUpdateIds: [successor.id],
    });
    expect(projected.updates.find((update) => update.id === successor.id)).toMatchObject({
      current: true,
      supersedesUpdateIds: [predecessor.id],
    });
  });
});
