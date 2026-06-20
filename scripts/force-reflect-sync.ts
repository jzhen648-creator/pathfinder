/**
 * Force a full reflect sync for a user (live Gemini + cache write).
 * Usage: npx tsx scripts/force-reflect-sync.ts j@gmail.com
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { runReflectSync } from "@/lib/ai/generate-reflect";
import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
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

  const [mapVersion, memoryVersion] = await Promise.all([
    computeMapVersion(user.id),
    getMemoryVersion(user.id),
  ]);

  console.log("Running full reflect sync for", user.email);
  const metrics = emptyMapAiSyncMetrics();

  const result = await runReflectSync(user.id, mapVersion, memoryVersion, {
    force: true,
    insightsStale: true,
    metrics,
    enrichOptions: DEFAULT_PURSUIT_ENRICH_OPTIONS,
  });

  console.log("Sync result:", result);
  console.log("Metrics:", {
    reflectCall: metrics.reflectCall,
    reflectScopedCalls: metrics.reflectScopedCalls,
    aiCallsCompleted: metrics.aiCallsCompleted,
    reflectResponseChars: metrics.reflectResponseChars,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
