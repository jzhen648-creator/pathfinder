/**
 * Cancel legacy pending StreamRun rows for one account — stops digest from
 * burning Gemini quota on full Update taps. Founder QA account only.
 *
 * Run:
 *   npm run cancel-pending-stream-runs
 *   npx tsx scripts/cancel-pending-stream-runs.ts --dry-run
 *   npx tsx scripts/cancel-pending-stream-runs.ts --email=you@example.com
 */
import { PrismaClient } from "@prisma/client";
import { resolveDevLoginEmail } from "../src/lib/dev-login-credentials";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const emailEq = argv.find((a) => a.startsWith("--email="))?.split("=")[1];
  const idx = argv.indexOf("--email");
  const emailFlag = idx >= 0 ? argv[idx + 1] : undefined;
  const email = (emailEq ?? emailFlag ?? resolveDevLoginEmail()).trim().toLowerCase();
  return { dryRun, email };
}

async function main() {
  const { dryRun, email } = parseArgs(process.argv.slice(2));
  if (!email) {
    console.error("No email — pass --email= or set dev login credentials.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const now = new Date();
  const pending = await prisma.streamRun.findMany({
    where: {
      userId: user.id,
      status: "pending",
      expiresAt: { gt: now },
    },
    select: { id: true, goalId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Account: ${user.email}`);
  console.log(`Pending StreamRuns (active): ${pending.length}`);

  if (pending.length === 0) {
    console.log("Nothing to cancel — digest will not run on legacy notes.");
    return;
  }

  for (const run of pending) {
    console.log(`  ${run.id} goal=${run.goalId} created=${run.createdAt.toISOString()}`);
  }

  if (dryRun) {
    console.log(`Dry run — would delete ${pending.length} pending row(s).`);
    return;
  }

  const deleted = await prisma.streamRun.deleteMany({
    where: {
      userId: user.id,
      status: "pending",
      expiresAt: { gt: now },
    },
  });

  const remaining = await prisma.streamRun.count({
    where: {
      userId: user.id,
      status: "pending",
      expiresAt: { gt: now },
    },
  });

  console.log(`Deleted ${deleted.count} pending StreamRun(s). Remaining pending: ${remaining}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
