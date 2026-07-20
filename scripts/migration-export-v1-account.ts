/**
 * Read-only V1 account export for Almanac V2 migration dry-run.
 *
 * SAFETY:
 * - Prisma find* / aggregate reads only — no create/update/upsert/delete/$executeRaw/$queryRawUnsafe schema DDL.
 * - Never prints DATABASE_URL or password/token fields.
 * - Requires explicit --user-id=… (no “most goals” auto-pick).
 * - Fails closed if user-id missing or not found.
 * - Writes under a gitignored path only.
 *
 * Usage (from pathfinder/, after founder identifies account):
 *   npx tsx scripts/migration-export-v1-account.ts --user-id=<cuid>
 *
 * Optional:
 *   --out=../almanac-v2/.data/v1-exports/founder-export.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function fail(message: string): never {
  console.error(JSON.stringify({ error: "export_aborted", message }));
  process.exit(1);
}

async function main() {
  const userIdArg = argValue("--user-id");
  const idPrefix = argValue("--id-prefix");
  const idHash8 = argValue("--id-hash");

  if (!userIdArg?.trim() && !idPrefix?.trim() && !idHash8?.trim()) {
    fail(
      "Refusing to export: pass --user-id=, --id-prefix=, or --id-hash= after identifying the founder. No auto-selection.",
    );
  }

  let userId = userIdArg?.trim();
  if (!userId) {
    const users = await prisma.user.findMany({ select: { id: true } });
    const matches = users.filter((u) => {
      if (idPrefix && u.id.startsWith(idPrefix)) return true;
      if (idHash8) {
        const h = createHash("sha256").update(u.id).digest("hex").slice(0, 8);
        return h === idHash8;
      }
      return false;
    });
    if (matches.length === 0) {
      fail("No user matched the given id-prefix/id-hash (fail closed).");
    }
    if (matches.length > 1) {
      fail(
        `Ambiguous match (${matches.length} users) — refine id-prefix or use full --user-id (fail closed).`,
      );
    }
    userId = matches[0]!.id;
  }

  const outPath = resolve(
    argValue("--out") ??
      "../almanac-v2/.data/v1-exports/founder-export.json",
  );

  // Ensure destination is under .data (gitignored) — refuse arbitrary paths.
  const normalized = outPath.replace(/\\/g, "/");
  if (!normalized.includes("/.data/") && !normalized.includes(".data/")) {
    fail("Export path must be under a .data/ directory (gitignored).");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      onboardingCompleted: true,
      taxonomyVersion: true,
      createdAt: true,
      updatedAt: true,
      // Explicitly exclude: passwordHash, passwordResetToken, passwordResetExpiry
      manualProfile: {
        select: {
          displayName: true,
          dateOfBirth: true,
          location: true,
          currencyCode: true,
          measurementSystem: true,
          occupation: true,
          educationLevel: true,
          employmentStatus: true,
          industry: true,
          jobTitle: true,
          languages: true,
          updatedAt: true,
        },
      },
      insightCache: {
        select: {
          id: true,
          updatedAt: true,
          mapVersion: true,
          overallInsight: true,
          themeInsights: true,
          categoryInsights: true,
          pursuitInsights: true,
          globalInsight: true,
        },
      },
      goals: {
        select: {
          id: true,
          title: true,
          description: true,
          background: true,
          enrichAnswers: true,
          lifeArea: true,
          goalType: true,
          targetAmount: true,
          currentAmount: true,
          unit: true,
          amountBasis: true,
          deadline: true,
          timelineStart: true,
          archived: true,
          status: true,
          completedAt: true,
          endedAt: true,
          endReason: true,
          parentGoalId: true,
          createdFromGoalId: true,
          year: true,
          month: true,
          sequencePosition: true,
          mapGridQ: true,
          mapGridR: true,
          significance: true,
          future: true,
          themeId: true,
          categoryId: true,
          createdAt: true,
          updatedAt: true,
          milestones: {
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              completedAt: true,
              dueDate: true,
            },
            orderBy: { position: "asc" },
          },
          relationshipsAsA: {
            select: {
              id: true,
              goalAId: true,
              goalBId: true,
              kind: true,
              label: true,
              confirmedAt: true,
            },
          },
          relationshipsAsB: {
            select: {
              id: true,
              goalAId: true,
              goalBId: true,
              kind: true,
              label: true,
              confirmedAt: true,
            },
          },
          statusTransitions: {
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              at: true,
            },
          },
          contextEntries: {
            select: {
              id: true,
              kind: true,
              text: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      pursuitRelationships: {
        select: {
          id: true,
          goalAId: true,
          goalBId: true,
          kind: true,
          label: true,
          confirmedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    fail(`No user found for --user-id (refusing silent fallback).`);
  }

  // Deduplicate relationships (appear on both sides of goal includes + user list).
  const relationshipById = new Map<
    string,
    {
      id: string;
      goalAId: string;
      goalBId: string;
      kind: string;
      label: string | null;
      confirmedAt: string;
    }
  >();
  for (const rel of user.pursuitRelationships) {
    relationshipById.set(rel.id, {
      id: rel.id,
      goalAId: rel.goalAId,
      goalBId: rel.goalBId,
      kind: rel.kind,
      label: rel.label,
      confirmedAt: rel.confirmedAt.toISOString(),
    });
  }

  const goals = user.goals.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    background: g.background,
    enrichAnswers: g.enrichAnswers,
    lifeArea: g.lifeArea,
    goalType: g.goalType,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    unit: g.unit,
    amountBasis: g.amountBasis,
    deadline: g.deadline?.toISOString() ?? null,
    timelineStart: g.timelineStart?.toISOString() ?? null,
    archived: g.archived,
    status: g.status,
    completedAt: g.completedAt?.toISOString() ?? null,
    endedAt: g.endedAt?.toISOString() ?? null,
    endReason: g.endReason,
    parentGoalId: g.parentGoalId,
    createdFromGoalId: g.createdFromGoalId,
    year: g.year,
    month: g.month,
    sequencePosition: g.sequencePosition,
    mapGridQ: g.mapGridQ,
    mapGridR: g.mapGridR,
    significance: g.significance,
    future: g.future,
    themeId: g.themeId,
    categoryId: g.categoryId,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    milestones: g.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.position,
      completed: m.completedAt != null,
      completedAt: m.completedAt?.toISOString() ?? null,
      dueDate: m.dueDate?.toISOString() ?? null,
    })),
    contextEntries: g.contextEntries.map((c) => ({
      id: c.id,
      kind: c.kind,
      text: c.text,
      createdAt: c.createdAt.toISOString(),
    })),
    statusTransitions: g.statusTransitions.map((t) => ({
      id: t.id,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      at: t.at.toISOString(),
    })),
  }));

  const insight = user.insightCache;
  const payload = {
    exportMeta: {
      exportedAt: new Date().toISOString(),
      readOnly: true,
      schema: "almanac-v1-founder-export/v1",
      // Never include connection string; only opaque user id.
      userId: user.id,
      emailRedacted: (() => {
        const [local, domain] = user.email.split("@");
        if (!local || !domain) return "***@***";
        return `${local[0] ?? "*"}***@${domain[0] ?? "*"}***.${domain.split(".").pop()}`;
      })(),
    },
    userId: user.id,
    profile: user.manualProfile
      ? {
          displayName: user.manualProfile.displayName,
          dateOfBirth: user.manualProfile.dateOfBirth?.toISOString() ?? null,
          location: user.manualProfile.location,
          currencyCode: user.manualProfile.currencyCode,
          measurementSystem: user.manualProfile.measurementSystem,
          occupation: user.manualProfile.occupation,
          educationLevel: user.manualProfile.educationLevel,
          employmentStatus: user.manualProfile.employmentStatus,
          industry: user.manualProfile.industry,
          jobTitle: user.manualProfile.jobTitle,
          languages: user.manualProfile.languages,
        }
      : null,
    userMeta: {
      onboardingCompleted: user.onboardingCompleted,
      taxonomyVersion: user.taxonomyVersion,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    goals,
    relationships: [...relationshipById.values()],
    insightCache: insight
      ? {
          id: insight.id,
          updatedAt: insight.updatedAt.toISOString(),
          mapVersion: insight.mapVersion,
          hasOverall: insight.overallInsight != null,
          hasThemeInsights: insight.themeInsights != null,
          hasCategoryInsights: insight.categoryInsights != null,
          hasPursuitInsights: insight.pursuitInsights != null,
          hasGlobalInsight: Boolean(insight.globalInsight),
          // Full bodies retained in export file for dry-run inventory only;
          // migration report will recommend drop/regenerate — not auto-apply.
          overallInsight: insight.overallInsight,
          themeInsights: insight.themeInsights,
          categoryInsights: insight.categoryInsights,
          pursuitInsights: insight.pursuitInsights,
          globalInsight: insight.globalInsight,
        }
      : null,
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const checksum = createHash("sha256").update(json).digest("hex");
  const counts = {
    goals: goals.length,
    milestones: goals.reduce((n, g) => n + g.milestones.length, 0),
    relationships: relationshipById.size,
    contextEntries: goals.reduce((n, g) => n + g.contextEntries.length, 0),
    statusTransitions: goals.reduce((n, g) => n + g.statusTransitions.length, 0),
    goalsWithAmounts: goals.filter(
      (g) => g.currentAmount != null || g.targetAmount != null,
    ).length,
    goalsWithEnrichAnswers: goals.filter((g) => g.enrichAnswers != null).length,
    hasInsightCache: insight != null,
    hasProfile: user.manualProfile != null,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, "utf8");

  const manifest = {
    ok: true,
    readOnly: true,
    outPath,
    sha256: checksum,
    byteLength: Buffer.byteLength(json, "utf8"),
    counts,
    userRef: `${user.id.slice(0, 6)}…`,
  };
  writeFileSync(
    outPath.replace(/\.json$/i, ".manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  // Console: no personal content beyond redacted refs and counts.
  console.log(JSON.stringify(manifest, null, 2));
}

main()
  .catch((err) => {
    console.error(
      JSON.stringify({
        error: "export_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
