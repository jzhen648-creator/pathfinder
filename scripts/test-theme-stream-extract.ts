/**
 * Theme-level Stream extract smoke test (Work & Career).
 * Run: npx tsx scripts/test-theme-stream-extract.ts
 */
import { PrismaClient } from "@prisma/client";
import { runStreamThemeExtract } from "../src/lib/ai/stream-extract";
import { hasGeminiKey } from "../src/lib/gemini";
import { buildStreamThemeContextInput } from "../src/lib/stream-theme-context";

const prisma = new PrismaClient();

const SAMPLE_DUMP = [
  "I got promoted to Head of Product last month — that's a big career moment.",
  "I'm working with an executive communication coach to sharpen how I show up in the room.",
  "I'm also building a portfolio website to showcase case studies from my last two roles.",
].join(" ");

function groupByHub<T extends { hubId?: string; title: string }>(
  label: string,
  items: T[],
): void {
  const byHub = new Map<string, T[]>();
  for (const item of items) {
    const slug = item.hubId ?? "(missing)";
    const list = byHub.get(slug) ?? [];
    list.push(item);
    byHub.set(slug, list);
  }
  console.log(`\n## ${label}`);
  if (byHub.size === 0) {
    console.log("  (none)");
    return;
  }
  for (const [hub, list] of [...byHub.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  [${hub}]`);
    for (const item of list) {
      console.log(`    - ${item.title}`);
    }
  }
}

async function main() {
  if (!hasGeminiKey()) {
    console.error("GEMINI_API_KEY not set - add to .env.local");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error("No users in database");
    process.exitCode = 1;
    return;
  }

  console.log("User:", user.email);
  console.log("Theme: work (Work & Career)");
  console.log("Input:", SAMPLE_DUMP);

  const themeContext = await buildStreamThemeContextInput(prisma, user.id, "work");
  if (!themeContext) {
    console.error("Could not load work theme hubs for user");
    process.exitCode = 1;
    return;
  }

  console.log(
    "Hubs:",
    themeContext.hubs.map((h) => `${h.hubLabel} (${h.hubId})`).join(", "),
  );

  const result = await runStreamThemeExtract(themeContext, SAMPLE_DUMP);

  groupByHub("Marks", result.marks);
  groupByHub("Pursuits", result.pursuits);
  groupByHub("Milestones", result.milestones);

  if (result.ambiguous.length > 0) {
    console.log("\n## Ambiguous");
    for (const a of result.ambiguous) {
      console.log(`  - ${a.label}${a.reason ? ` (${a.reason})` : ""}`);
    }
  }

  if (result.clarifyingQuestion) {
    console.log("\nClarifying question:", result.clarifyingQuestion);
  }

  const slugs = new Set(themeContext.hubs.map((h) => h.hubId));
  const used = new Set([
    ...result.marks.map((m) => m.hubId),
    ...result.pursuits.map((p) => p.hubId),
    ...result.milestones.map((ms) => ms.hubId),
  ]);
  const unexpected = [...used].filter((s) => s && !slugs.has(s));
  if (unexpected.length > 0) {
    console.error("\nUnexpected hub slugs:", unexpected.join(", "));
    process.exitCode = 1;
  } else {
    console.log("\nOK — all items use valid theme hub slugs");
  }
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
