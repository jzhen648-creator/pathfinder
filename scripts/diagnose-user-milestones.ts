import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import {
  hasMinimumContextSignal,
  pursuitSignalFromGoal,
  shouldSuggestMilestones,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { prisma } from "@/lib/prisma";

const email = process.argv[2] ?? "j@gmail.com";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.log("USER NOT FOUND:", email);
    return;
  }
  console.log("USER", user);

  const goals = await prisma.goal.findMany({
    where: { userId: user.id, archived: false },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      targetAmount: true,
      currentAmount: true,
      milestones: {
        select: { id: true, title: true, completedAt: true, position: true },
      },
    },
    orderBy: { title: "asc" },
  });

  const cache = await prisma.insightCache.findUnique({
    where: { userId: user.id },
    select: { pursuitInsights: true, generatedAt: true, mapVersion: true, memoryVersion: true },
  });
  const pursuits = cache?.pursuitInsights
    ? parsePursuitInsightRecord(cache.pursuitInsights, "pursuit")
    : {};

  const needles = ["mortgage", "debt", "porsche", "credit"];
  for (const g of goals) {
    const lower = g.title.toLowerCase();
    if (!needles.some((n) => lower.includes(n))) continue;
    const signal = pursuitSignalFromGoal({ ...g, milestones: g.milestones });
    const insight = pursuits[g.id];
    console.log("\n===", g.title, "===");
    console.log("id:", g.id);
    console.log("targetAmount:", g.targetAmount, "currentAmount:", g.currentAmount);
    console.log("deadline:", g.deadline);
    console.log("status:", g.status);
    console.log("milestones:", g.milestones.length);
    console.log(
      "enrichAnswers count:",
      Array.isArray(g.enrichAnswers) ? g.enrichAnswers.length : 0,
    );
    console.log("enrichAnswers:", JSON.stringify(g.enrichAnswers, null, 2));
    console.log("hasMinimumContextSignal:", hasMinimumContextSignal(signal));
    console.log("shouldSuggestMilestones:", shouldSuggestMilestones(signal));
    console.log("signal:", JSON.stringify(signal));
    console.log("cache headline:", insight?.headline?.slice(0, 100));
    console.log("cache body:", insight?.body?.slice(0, 120));
    console.log(
      "cache suggestedMilestones:",
      JSON.stringify(insight?.suggestedMilestones ?? null),
    );
    console.log("cache clarifiers:", (insight?.clarifiers ?? []).length);
    console.log("cache quickQuestionsQuietUntil:", insight?.quickQuestionsQuietUntil ?? null);
  }

  const dirty = await prisma.aiReadingDirtyItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log("\nDIRTY LEDGER (latest 20):");
  for (const row of dirty) {
    console.log(`- ${row.entityType}/${row.entityId} reason=${row.reason} at=${row.createdAt.toISOString()}`);
  }

  console.log("\ncache generatedAt:", cache?.generatedAt?.toISOString() ?? null);

  const goalCount = await prisma.goal.count({ where: { userId: user.id, archived: false } });
  const story = await prisma.storyCache.findUnique({ where: { userId: user.id } });
  const { computeMapVersion, getMemoryVersion } = await import("@/lib/insights/compute-map-version");
  const [mapVersion, memoryVersion] = await Promise.all([
    computeMapVersion(user.id),
    getMemoryVersion(user.id),
  ]);
  console.log("\nVERSIONS:");
  console.log("goalCount:", goalCount);
  console.log("live mapVersion:", mapVersion, "memoryVersion:", memoryVersion);
  console.log(
    "insight cache versions:",
    cache?.mapVersion,
    cache?.memoryVersion,
    "stale?",
    !cache || cache.mapVersion !== mapVersion || cache.memoryVersion !== memoryVersion,
  );
  console.log(
    "story cache versions:",
    story?.mapVersion,
    story?.memoryVersion,
    "stale?",
    !story || story.mapVersion !== mapVersion || story.memoryVersion !== memoryVersion,
  );
  console.log("hasStory:", Boolean(story?.payload?.trim()));

  const { buildReflectMilestoneOptions } = await import("@/lib/ai/generate-reflect");
  const { pursuitSignalFromGoal: signalFrom } = await import("@/lib/pursuit/pursuit-enrich-readiness");
  const targetGoals = goals.filter((g) =>
    ["mortgage", "debt", "porsche", "credit"].some((n) => g.title.toLowerCase().includes(n)),
  );
  const signals = new Map(
    targetGoals.map((g) => [g.id, signalFrom({ ...g, milestones: g.milestones })]),
  );
  console.log("\nMILESTONE_OPTIONS user-message block:");
  console.log(buildReflectMilestoneOptions(targetGoals.map((g) => g.id), signals));

  console.log("\nALL PURSUITS summary:");
  for (const g of goals) {
    const insight = pursuits[g.id];
    console.log(
      `- ${g.title} | mapMs=${g.milestones.length} | qq=${Array.isArray(g.enrichAnswers) ? g.enrichAnswers.length : 0} | cacheSuggestions=${(insight?.suggestedMilestones ?? []).length}`,
    );
  }

  const storyStale =
    !story || story.mapVersion !== mapVersion || story.memoryVersion !== memoryVersion;
  console.log("\nSYNC PATH INFERENCE:");
  console.log("hasStory:", Boolean(story?.payload?.trim()), "| storyStale:", storyStale);
  console.log(
    "Typical post-QQ Update tap → mode=dirty → needsReadingRefresh=false → pursuits-only reflect scope",
  );
  console.log(
    "pursuits-only system prompt: NO suggestedMilestones rules; HAS 'Never invent milestones'",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
