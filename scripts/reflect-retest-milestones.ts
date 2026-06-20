/**
 * Reflect retest — dirty 3 pursuits, runMapAiSync (same path as POST /api/map/ai-sync), verify milestones land in cache.
 * Usage: npx tsx scripts/reflect-retest-milestones.ts j@gmail.com
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import { runMapAiSync } from "@/lib/map/ai-sync";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { shouldSuggestMilestones, pursuitSignalFromGoal } from "@/lib/pursuit/pursuit-enrich-readiness";
import { prisma } from "@/lib/prisma";

const email = process.argv[2] ?? "j@gmail.com";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.log("USER NOT FOUND:", email);
    process.exit(1);
  }

  const pursuits = await prisma.goal.findMany({
    where: { userId: user.id, archived: false, goalType: { notIn: ["moment", "event"] } },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      targetAmount: true,
      milestones: { select: { completedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });

  if (pursuits.length === 0) {
    console.log("No pursuits to dirty");
    process.exit(1);
  }

  console.log("Dirtying pursuits:", pursuits.map((p) => p.title).join(", "));
  for (const pursuit of pursuits) {
    await markPursuitReadingDirty(user.id, pursuit.id, "reflect_retest_milestones");
  }

  console.log("Running runMapAiSync (reflect path)...");
  const result = await runMapAiSync(user.id, { force: true });

  console.log("\nSync result:", {
    skipped: result.skipped,
    insightsRefreshed: result.insights.refreshed,
    storyRefreshed: result.story.refreshed,
    reflectCall: result.metrics.reflectCall,
    aiCallsCompleted: result.metrics.aiCallsCompleted,
    dirtyPursuits: result.metrics.dirtyPursuits,
  });

  const cache = await prisma.insightCache.findUnique({
    where: { userId: user.id },
    select: { pursuitInsights: true, generatedAt: true },
  });
  const cached = cache?.pursuitInsights
    ? parsePursuitInsightRecord(cache.pursuitInsights, "pursuit")
    : {};

  let pass = !result.skipped && result.insights.refreshed && result.metrics.reflectCall === true;
  let allowedWithSuggestions = 0;
  let allowedMissingSuggestions = 0;

  console.log("\nMilestone cache check (dirty batch):");
  for (const pursuit of pursuits) {
    const signal = pursuitSignalFromGoal(pursuit);
    const allowed = shouldSuggestMilestones(signal);
    const count = cached[pursuit.id]?.suggestedMilestones?.length ?? 0;
    const ok = !allowed || count > 0;
    if (allowed && count > 0) allowedWithSuggestions += 1;
    if (allowed && count === 0) allowedMissingSuggestions += 1;
    pass = pass && ok;
    console.log(`- ${pursuit.title}: allowed=${allowed} suggestions=${count} ${ok ? "OK" : "FAIL"}`);
  }

  console.log("\nVerdict:", pass ? "PASS" : "FAIL");
  console.log("cache generatedAt:", cache?.generatedAt?.toISOString() ?? null);
  process.exit(pass ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
