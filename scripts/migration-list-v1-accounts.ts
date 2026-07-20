/**
 * Read-only: list V1 accounts for founder migration identification.
 *
 * Prints ONLY redacted email, shortened user id, goal count, last activity.
 * Never prints DATABASE_URL, passwords, tokens, names, notes, or titles.
 *
 * Usage (from pathfinder/):
 *   npx tsx scripts/migration-list-v1-accounts.ts
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  // Never log queries that might embed connection strings.
  log: ["error"],
});

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  const localHint = local.length <= 1 ? "*" : `${local[0]}***`;
  const parts = domain.split(".");
  const tld = parts.length > 1 ? parts[parts.length - 1] : "***";
  const host = parts[0] ?? "";
  const hostHint = host.length <= 1 ? "*" : `${host[0]}***`;
  return `${localHint}@${hostHint}.${tld}`;
}

function shortUserId(id: string): {
  userRef: string;
  idPrefix: string;
  idHash8: string;
} {
  const idHash8 = createHash("sha256").update(id).digest("hex").slice(0, 8);
  const idPrefix = id.slice(0, 10);
  return {
    userRef: `${idPrefix}…#${idHash8}`,
    idPrefix,
    idHash8,
  };
}

function isoDay(d: Date | null | undefined): string {
  if (!d) return "unknown";
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Identification-only select — no profile names, no goal titles/notes.
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      updatedAt: true,
      _count: { select: { goals: true } },
      goals: {
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = users.map((u) => {
    const latestGoal = u.goals[0]?.updatedAt ?? null;
    const lastActivity =
      latestGoal && latestGoal > u.updatedAt ? latestGoal : u.updatedAt;
    const ids = shortUserId(u.id);
    return {
      userRef: ids.userRef,
      idPrefix: ids.idPrefix,
      idHash8: ids.idHash8,
      emailRedacted: redactEmail(u.email),
      goalCount: u._count.goals,
      lastActivity: isoDay(lastActivity),
    };
  });

  const withGoals = rows.filter((r) => r.goalCount > 0);
  const credible =
    withGoals.length > 0
      ? withGoals
      : rows.filter((r) => r.goalCount === 0);

  console.log(
    JSON.stringify(
      {
        mode: "identify-only",
        readOnly: true,
        accountCount: rows.length,
        accountsWithGoals: withGoals.length,
        howToSelect:
          "Reply with idPrefix (10 chars) or idHash8 for the founder account. Full export: npx tsx scripts/migration-export-v1-account.ts --id-prefix=<idPrefix>",
        note:
          withGoals.length === 1
            ? "Exactly one account has goals — still confirm before full export."
            : withGoals.length === 0
              ? "No accounts have goals in this database."
              : "Multiple accounts have goals — identify the founder before full export. Do not assume highest goalCount.",
        candidates: credible.map(
          ({
            userRef,
            idPrefix,
            idHash8,
            emailRedacted,
            goalCount,
            lastActivity,
          }) => ({
            userRef,
            idPrefix,
            idHash8,
            emailRedacted,
            goalCount,
            lastActivity,
          }),
        ),
        zeroGoalAccounts:
          withGoals.length > 0
            ? rows
                .filter((r) => r.goalCount === 0)
                .map(
                  ({
                    userRef,
                    idPrefix,
                    idHash8,
                    emailRedacted,
                    lastActivity,
                  }) => ({
                    userRef,
                    idPrefix,
                    idHash8,
                    emailRedacted,
                    goalCount: 0,
                    lastActivity,
                  }),
                )
            : [],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(
      JSON.stringify({
        error: "identify_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
