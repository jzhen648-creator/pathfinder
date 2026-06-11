/**
 * Per-account content wipe — prepares ONE user for a from-scratch simulation.
 *
 * Clears a single user's map to empty (preserving system hubs and onboarding
 * flags), ensures all 17 system hubs exist, and optionally unlocks themes for
 * map visibility. It does NOT reseed any fixture data.
 *
 * Run:
 *   npm run wipe:user-tree -- --email nelson.mandela@pathfinder.test
 *   npm run wipe:user-tree -- --email nelson.mandela@pathfinder.test --unlock-themes
 *
 * Safety: refuses to run against any email not ending in `@pathfinder.test`
 * unless `--force` is passed.
 */
import { PrismaClient } from "@prisma/client";
import { syncHubTaxonomyForUser } from "../src/lib/hub-taxonomy-sync";
import { getStreamSessionDelegate } from "../src/lib/prisma-stream-session";
import { LIFE_AREA_IDS } from "../src/lib/taxonomy";
import { unlockThemesForUser } from "../src/lib/unlocked-themes";

const prisma = new PrismaClient();

type Args = {
  email: string | null;
  unlockThemes: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { email: null, unlockThemes: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") {
      args.email = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--email=")) {
      args.email = arg.slice("--email=".length);
    } else if (arg === "--unlock-themes") {
      args.unlockThemes = true;
    } else if (arg === "--force") {
      args.force = true;
    }
  }
  return args;
}

/**
 * Content wipe for one user — mirrors `wipeUserTreeData` in
 * `reset-all-accounts-fresh.ts` but scoped to a single account and also clears
 * stream sessions. Preserves system hub rows (deactivated, not deleted).
 */
async function wipeUserTreeData(userId: string): Promise<{ goals: number; marks: number; branches: number }> {
  await prisma.goalEvaluationCache.deleteMany({ where: { userId } });
  const goals = await prisma.goal.deleteMany({ where: { userId } });
  const marks = await prisma.mark.deleteMany({ where: { userId } });
  const branches = await prisma.themeCategory.deleteMany({ where: { userId, isSystemHub: false } });
  await prisma.themeCategory.updateMany({
    where: { userId, isSystemHub: true },
    data: { isActive: false },
  });
  await prisma.trunkEntry.deleteMany({ where: { userId } });
  await prisma.trunkSegment.deleteMany({ where: { userId } });

  const streamSession = getStreamSessionDelegate(prisma);
  if (streamSession) {
    await streamSession.deleteMany({ where: { userId } });
  }

  return { goals: goals.count, marks: marks.count, branches: branches.count };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    console.error("Error: --email is required.");
    console.error("Usage: npm run wipe:user-tree -- --email <user@pathfinder.test> [--unlock-themes] [--force]");
    process.exitCode = 1;
    return;
  }

  const email = args.email.trim();

  if (!email.endsWith("@pathfinder.test") && !args.force) {
    console.error(`Refusing to wipe non-test account: ${email}`);
    console.error("This is a destructive operation. Pass --force to override (e.g. for a real account).");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error(`No user found for email: ${email}`);
    process.exitCode = 1;
    return;
  }

  console.warn("");
  console.warn("================================================================");
  console.warn(`  DESTRUCTIVE WIPE — clearing ALL map content for: ${user.email}`);
  console.warn("  Goals, marks, non-system branches, trunk + stream data deleted.");
  console.warn("  System hubs and onboarding flags are preserved.");
  console.warn("================================================================");
  console.warn("");

  console.log(`Step 1/4: Content wipe for ${user.email}…`);
  const wiped = await wipeUserTreeData(user.id);
  console.log(`  deleted goals:           ${wiped.goals}`);
  console.log(`  deleted marks:           ${wiped.marks}`);
  console.log(`  deleted custom branches: ${wiped.branches}`);
  console.log("  system hubs set dormant; trunk + stream sessions cleared.");

  console.log("\nStep 2/4: Ensuring 17 system hubs…");
  await syncHubTaxonomyForUser(prisma, user.id);
  const hubCount = await prisma.themeCategory.count({
    where: { userId: user.id, parentBranchId: null, isSystemHub: true },
  });
  console.log(`  system hubs present: ${hubCount}`);

  console.log("\nStep 3/4: Preserving onboarding flags…");
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingCompleted: true, firstRunCompleted: true },
  });
  console.log("  onboardingCompleted: true");
  console.log("  firstRunCompleted:   true");

  console.log("\nStep 4/4: Theme unlock…");
  let unlockedThemes: readonly string[] = [];
  if (args.unlockThemes) {
    unlockedThemes = await unlockThemesForUser(prisma, user.id, LIFE_AREA_IDS);
    console.log(`  unlocked themes: ${unlockedThemes.join(", ")}`);
  } else {
    console.log("  skipped (themes stay locked; Stream commit will activate hubs as it goes).");
  }

  console.log("\n--- Summary ---");
  console.log(`user:            ${user.email}`);
  console.log(`hubs ensured:    ${hubCount}`);
  console.log(`goals deleted:   ${wiped.goals}`);
  console.log(`marks deleted:   ${wiped.marks}`);
  console.log("flags set:       onboardingCompleted=true, firstRunCompleted=true");
  console.log(`themes unlocked: ${args.unlockThemes ? `yes (${unlockedThemes.length})` : "no"}`);
  console.log("\nDone. Account is empty with system hubs ready for the simulation.");
}

main()
  .catch((err) => {
    console.error("wipe-user-tree failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
