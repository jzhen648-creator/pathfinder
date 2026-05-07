import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BRANCH_TEMPLATES: Array<{ limbId: string; name: string; order: number }> = [
  { limbId: "finance", name: "Investing", order: 1 },
  { limbId: "finance", name: "Home Ownership", order: 2 },
  { limbId: "finance", name: "Debt Freedom", order: 3 },
  { limbId: "finance", name: "Income Growth", order: 4 },
  { limbId: "work", name: "Main Career", order: 1 },
  { limbId: "work", name: "Side Hustle", order: 2 },
  { limbId: "work", name: "Skills & Learning", order: 3 },
  { limbId: "people", name: "Family", order: 1 },
  { limbId: "people", name: "Friends", order: 2 },
  { limbId: "people", name: "Romance", order: 3 },
  { limbId: "health", name: "Fitness", order: 1 },
  { limbId: "health", name: "Mental Health", order: 2 },
  { limbId: "health", name: "Rest & Recovery", order: 3 },
  { limbId: "becoming", name: "Mindset", order: 1 },
  { limbId: "becoming", name: "Habits", order: 2 },
  { limbId: "becoming", name: "Identity", order: 3 },
];

function inferMarkType(moment: {
  isTurningPoint?: boolean | null;
  future?: boolean | null;
  significance?: number | null;
}): "milestone" | "setback" | "realisation" | "decision" | "achievement" {
  if (moment.isTurningPoint) return "decision";
  if (moment.future) return "milestone";
  if (Number(moment.significance ?? 1) >= 3) return "achievement";
  return "milestone";
}

function inferMarkSentiment(moment: {
  future?: boolean | null;
  significance?: number | null;
}): "positive" | "neutral" | "negative" {
  if (moment.future) return "positive";
  if (Number(moment.significance ?? 1) >= 3) return "positive";
  return "neutral";
}

async function ensureDefaultBranchesForUsers(
  userIds: string[],
  limbIds: string[],
): Promise<Map<string, string>> {
  const primaryByUserAndLimb = new Map<string, string>();

  for (const userId of userIds) {
    for (const limbId of limbIds) {
      const templates = BRANCH_TEMPLATES.filter((t) => t.limbId === limbId);
      for (const template of templates) {
        const existingByName = await prisma.branch.findFirst({
          where: { userId, limbId, OR: [{ name: template.name }, { label: template.name }] },
          select: { id: true },
        });
        if (existingByName) continue;
        await prisma.branch.create({
          data: {
            userId,
            limbId,
            label: template.name,
            name: template.name,
            status: "active",
            order: template.order,
            mapAngleOffset: 0,
            parentBranchId: null,
            turningPointId: null,
          },
        });
      }
      const primary = await prisma.branch.findFirst({
        where: { userId, limbId, OR: [{ name: templates[0]?.name }, { label: templates[0]?.name }] },
        select: { id: true },
      });
      if (primary) {
        primaryByUserAndLimb.set(`${userId}::${limbId}`, primary.id);
      }
    }
  }

  return primaryByUserAndLimb;
}

function inferJourneyBranchName(g: {
  limbId: string;
  title?: string | null;
  description?: string | null;
}): string {
  const text = `${g.title ?? ""} ${g.description ?? ""}`.toLowerCase();
  if (g.limbId === "finance") {
    if (/(debt|loan|paid off)/.test(text)) return "Debt Freedom";
    if (/(salary|income|pay|profitable|revenue)/.test(text)) return "Income Growth";
    if (/(flat|home|house|mortgage)/.test(text)) return "Home Ownership";
    return "Investing";
  }
  if (g.limbId === "work") {
    if (/(side hustle|freelanc|startup|own thing)/.test(text)) return "Side Hustle";
    if (/(skill|learn|course|cert)/.test(text)) return "Skills & Learning";
    return "Main Career";
  }
  if (g.limbId === "people") {
    if (/(dad|mum|family|parent)/.test(text)) return "Family";
    if (/(engag|partner|romance|sam)/.test(text)) return "Romance";
    return "Friends";
  }
  if (g.limbId === "health") {
    if (/(burnout|anxiety|therapy|stress|mental)/.test(text)) return "Mental Health";
    if (/(rest|sleep|recovery)/.test(text)) return "Rest & Recovery";
    return "Fitness";
  }
  if (g.limbId === "becoming") {
    if (/(habit|routine)/.test(text)) return "Habits";
    if (/(identity|became|builder)/.test(text)) return "Identity";
    return "Mindset";
  }
  return "Main Career";
}

async function main() {
  const timelineGoals = await prisma.goal.findMany({
    where: { goalType: { in: ["moment", "event"] }, limbId: { not: null } },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });

  if (timelineGoals.length === 0) {
    console.log("No timeline goals (moment/event) found; nothing to backfill.");
    return;
  }

  const userIds = [...new Set(timelineGoals.map((g) => g.userId))];
  const limbIds = [...new Set(timelineGoals.map((g) => g.limbId).filter((id): id is string => id != null))];
  const defaultBranches = await ensureDefaultBranchesForUsers(userIds, limbIds);

  for (const g of timelineGoals) {
    const limbId = g.limbId;
    if (limbId == null) continue;
    const targetBranchName = inferJourneyBranchName({ limbId, title: g.title, description: g.description });
    const target = await prisma.branch.findFirst({
      where: {
        userId: g.userId,
        limbId,
        OR: [{ name: targetBranchName }, { label: targetBranchName }],
      },
      select: { id: true },
    });
    const fallbackBranchId = defaultBranches.get(`${g.userId}::${limbId}`) ?? null;
    const branchId = target?.id ?? fallbackBranchId;
    if (!branchId) continue;

    const month = Number(g.month ?? 1);
    const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
    const date = new Date(`${g.year}-${String(safeMonth).padStart(2, "0")}-01T00:00:00.000Z`);

    await prisma.mark.upsert({
      where: { id: g.id },
      update: {
        branchId,
        limbId,
        userId: g.userId,
        title: g.title,
        description: g.description || null,
        date,
        type: inferMarkType(g),
        value: null,
        sentiment: inferMarkSentiment(g),
        archived: false,
      },
      create: {
        id: g.id,
        branchId,
        limbId,
        userId: g.userId,
        title: g.title,
        description: g.description || null,
        date,
        type: inferMarkType(g),
        value: null,
        sentiment: inferMarkSentiment(g),
        archived: false,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      },
    });
  }

  console.log(`Backfilled ${timelineGoals.length} timeline goals into marks.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
