/**
 * Live probe: one pursuit, pursuits-only reflect — print suggestedMilestones from Gemini.
 * Usage: npx tsx scripts/probe-reflect-milestones.ts j@gmail.com "Secure Mortgage Broker Job"
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { analyzeReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { generateReflectResponse } from "@/lib/ai/generate-reflect";
import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
import { prisma } from "@/lib/prisma";

const email = process.argv[2] ?? "j@gmail.com";
const titleNeedle = process.argv[3] ?? "Mortgage Broker";
const scopeArg = process.argv.includes("--full") ? "full" : "pursuits-only";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    console.log("USER NOT FOUND");
    return;
  }

  const goal = await prisma.goal.findFirst({
    where: { userId: user.id, archived: false, title: { contains: titleNeedle, mode: "insensitive" } },
    select: { id: true, title: true },
  });
  if (!goal) {
    console.log("GOAL NOT FOUND for", titleNeedle);
    return;
  }

  const goals = await prisma.goal.findMany({
    where: { userId: user.id, archived: false },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  const pursuitIds = goal.id ? [goal.id] : goals.map((g) => g.id);
  const probeIds = process.argv[4] === "--all" ? goals.map((g) => g.id) : [goal.id];

  console.log("Probing", probeIds.length, "pursuit(s), scope:", scopeArg);

  const dirty = await analyzeReadingDirty(user.id);
  const metrics = emptyMapAiSyncMetrics();

  const reflect = await generateReflectResponse(
    user.id,
    dirty,
    probeIds,
    [],
    DEFAULT_PURSUIT_ENRICH_OPTIONS,
    "",
    metrics,
    { scope: scopeArg as "full" | "pursuits-only" },
  );

  console.log("\nReflect metrics:", {
    reflectScopedCalls: metrics.reflectScopedCalls,
    reflectResponseChars: metrics.reflectResponseChars,
  });

  for (const id of probeIds) {
    const g = goals.find((x) => x.id === id);
    const entry = reflect.pursuits[id];
    const count = entry?.suggestedMilestones?.length ?? 0;
    console.log(`- ${g?.title ?? id}: suggestions=${count}`);
  }

  if (probeIds.length === 1) {
    const entry = reflect.pursuits[probeIds[0]!];
    console.log("\nheadline:", entry?.headline);
    console.log("\nsuggestedMilestones:", JSON.stringify(entry?.suggestedMilestones ?? null, null, 2));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
