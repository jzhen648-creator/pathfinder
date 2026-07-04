/**
 * Summarize friends-and-family TestFlight usage from Postgres.
 *
 * Usage (production DB in .env):
 *   cd pathfinder && npm run report:beta-usage
 *   npm run report:beta-usage -- --email=friend@example.com
 *   npm run report:beta-usage -- --all   # include archived chapters
 */
import { PrismaClient, type PursuitStatus } from "@prisma/client";

const prisma = new PrismaClient();

const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const emailFlagIdx = process.argv.indexOf("--email");
const emailFromFlag =
  emailFlagIdx >= 0 && process.argv[emailFlagIdx + 1] ? process.argv[emailFlagIdx + 1] : undefined;
const filterEmail = emailArg ?? emailFromFlag ?? process.env.BETA_REPORT_EMAIL;
const includeArchived = process.argv.includes("--all");

function fmtDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function fmtTheme(themeId: string | null, lifeArea: string): string {
  return (themeId ?? lifeArea).toLowerCase();
}

function fmtChapterLine(
  title: string,
  status: PursuitStatus,
  themeId: string | null,
  lifeArea: string,
  createdAt: Date,
  archived: boolean,
): string {
  const flags = archived ? "archived · " : "";
  return `    · ${flags}[${status}] ${fmtTheme(themeId, lifeArea)} — "${title}" (${fmtDate(createdAt)})`;
}

async function main() {
  const users = await prisma.user.findMany({
    where: filterEmail ? { email: filterEmail } : undefined,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      onboardingCompleted: true,
      lastReadingDeliveredAt: true,
      _count: { select: { goals: true, betaUsageEvents: true } },
    },
  });

  console.log("\n=== Almanac beta users ===\n");
  if (users.length === 0) {
    console.log(filterEmail ? `No user found for email: ${filterEmail}` : "No users found.");
    return;
  }

  const allGoals = await prisma.goal.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: {
      userId: true,
      title: true,
      status: true,
      lifeArea: true,
      themeId: true,
      archived: true,
      createdAt: true,
    },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });

  const goalsByUser = new Map<string, typeof allGoals>();
  for (const goal of allGoals) {
    const list = goalsByUser.get(goal.userId) ?? [];
    list.push(goal);
    goalsByUser.set(goal.userId, list);
  }

  for (const user of users) {
    const lastEvent = await prisma.betaUsageEvent.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, name: true },
    });

    const eventCounts = await prisma.betaUsageEvent.groupBy({
      by: ["name"],
      where: { userId: user.id },
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
    });

    const chapters = goalsByUser.get(user.id) ?? [];
    const activeChapters = chapters.filter((g) => !g.archived);
    const archivedChapters = chapters.filter((g) => g.archived);

    console.log(`${user.name ?? "(no name)"} <${user.email}>`);
    console.log(`  registered: ${fmtDate(user.createdAt)}`);
    console.log(
      `  onboarding: ${user.onboardingCompleted ? "done" : "incomplete"} · chapters: ${user._count.goals} · events: ${user._count.betaUsageEvents}`,
    );
    console.log(`  last reading: ${fmtDate(user.lastReadingDeliveredAt)}`);
    console.log(
      `  last seen: ${lastEvent ? `${fmtDate(lastEvent.createdAt)} (${lastEvent.name})` : "—"}`,
    );
    if (eventCounts.length > 0) {
      const summary = eventCounts
        .slice(0, 12)
        .map((row) => `${row.name}×${row._count._all}`)
        .join(", ");
      console.log(`  events: ${summary}`);
    }

    if (activeChapters.length > 0) {
      console.log("  chapters:");
      for (const goal of activeChapters) {
        console.log(fmtChapterLine(goal.title, goal.status, goal.themeId, goal.lifeArea, goal.createdAt, false));
      }
    } else if (!includeArchived) {
      console.log("  chapters: (none active)");
    }

    if (includeArchived && archivedChapters.length > 0) {
      console.log("  archived chapters:");
      for (const goal of archivedChapters) {
        console.log(fmtChapterLine(goal.title, goal.status, goal.themeId, goal.lifeArea, goal.createdAt, false));
      }
    } else if (!includeArchived && archivedChapters.length > 0) {
      console.log(`  archived chapters: ${archivedChapters.length} (use --all to list)`);
    }

    console.log("");
  }

  const recent = await prisma.betaUsageEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      createdAt: true,
      name: true,
      props: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (recent.length > 0) {
    console.log("=== Recent events (latest 25) ===\n");
    for (const event of recent) {
      const who = event.user.name ?? event.user.email;
      const props =
        event.props && typeof event.props === "object"
          ? ` ${JSON.stringify(event.props)}`
          : "";
      console.log(`${fmtDate(event.createdAt)}  ${who}  ${event.name}${props}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
