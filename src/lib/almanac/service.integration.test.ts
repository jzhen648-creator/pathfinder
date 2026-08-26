import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  AlmanacNotFoundError,
  commitAlmanacImport,
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
      AND table_name NOT IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
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
        AND cls.relname IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
      ORDER BY cls.relname
    `;
    expect(tables).toHaveLength(5);
    expect(tables).toEqual(expect.arrayContaining([
      { table_name: "AlmanacImport", row_security: true },
      { table_name: "AlmanacPlace", row_security: true },
      { table_name: "AlmanacSubjectPreference", row_security: true },
      { table_name: "AlmanacUpdatePreference", row_security: true },
      { table_name: "AlmanacUpdate", row_security: true },
    ]));

    const policies = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
    `;
    expect(policies[0]?.count).toBe(BigInt(0));

    const exposedGrants = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate', 'AlmanacSubjectPreference', 'AlmanacUpdatePreference')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    `;
    expect(exposedGrants[0]?.count).toBe(BigInt(0));

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('AlmanacImport', 'AlmanacPlace', 'AlmanacUpdate')
    `;
    const indexNames = new Set(indexes.map((index) => index.indexname));
    for (const required of [
      "AlmanacImport_userId_idempotencyKey_key",
      "AlmanacPlace_userId_normalisedName_key",
      "AlmanacPlace_userId_slot_key",
      "AlmanacUpdate_importId_sourceLineNumber_key",
      "AlmanacUpdate_userId_placeId_state_createdAt_idx",
    ]) {
      expect(indexNames.has(required), `missing index ${required}`).toBe(true);
    }

    const constraints = await prisma.$queryRaw<Array<{ conname: string; definition: string }>>`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN (
        'public."AlmanacImport"'::regclass,
        'public."AlmanacPlace"'::regclass,
        'public."AlmanacUpdate"'::regclass
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
    expect(constraintByName.has("AlmanacPlace_slot_range")).toBe(false);

    const triggers = await prisma.$queryRaw<Array<{ trigger_name: string }>>`
      SELECT tgname AS trigger_name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN (
          'public."AlmanacImport"'::regclass,
          'public."AlmanacPlace"'::regclass,
          'public."AlmanacUpdate"'::regclass
        )
      ORDER BY tgname
    `;
    expect(triggers.map((trigger) => trigger.trigger_name)).toEqual([
      "AlmanacImport_immutable_provenance",
      "AlmanacPlace_append_only",
      "AlmanacUpdate_append_only",
    ]);
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
    const retry = await commitAlmanacImport(userId, request);
    expect(first.disposition).toBe("created");
    expect(retry).toMatchObject({ disposition: "idempotent_retry", import: { id: first.import.id } });
    expect(first.import.receipt.counts).toMatchObject({ accepted: 1, rejected: 1 });
    expect(await prisma.almanacUpdate.count({ where: { userId } })).toBe(1);
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

    await prisma.$executeRawUnsafe(
      'GRANT SELECT, INSERT ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate" TO anon, authenticated',
    );
    await prisma.$executeRawUnsafe(
      'GRANT SELECT ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate" TO service_role',
    );
    try {
      for (const role of ["anon", "authenticated"]) {
        await prisma.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
            'SELECT id FROM "AlmanacImport"',
          );
          expect(rows).toEqual([]);
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
        'REVOKE ALL PRIVILEGES ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate" FROM anon, authenticated, service_role',
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
});
