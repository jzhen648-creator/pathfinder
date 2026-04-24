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

function inferJourneyBranchName(moment: {
  limbId: string;
  label?: string | null;
  description?: string | null;
}): string {
  const text = `${moment.label ?? ""} ${moment.description ?? ""}`.toLowerCase();
  if (moment.limbId === "finance") {
    if (/(debt|loan|paid off)/.test(text)) return "Debt Freedom";
    if (/(salary|income|pay|profitable|revenue)/.test(text)) return "Income Growth";
    if (/(flat|home|house|mortgage)/.test(text)) return "Home Ownership";
    return "Investing";
  }
  if (moment.limbId === "work") {
    if (/(side hustle|freelanc|startup|own thing)/.test(text)) return "Side Hustle";
    if (/(skill|learn|course|cert)/.test(text)) return "Skills & Learning";
    return "Main Career";
  }
  if (moment.limbId === "people") {
    if (/(dad|mum|family|parent)/.test(text)) return "Family";
    if (/(engag|partner|romance|sam)/.test(text)) return "Romance";
    return "Friends";
  }
  if (moment.limbId === "health") {
    if (/(burnout|anxiety|therapy|stress|mental)/.test(text)) return "Mental Health";
    if (/(rest|sleep|recovery)/.test(text)) return "Rest & Recovery";
    return "Fitness";
  }
  if (moment.limbId === "becoming") {
    if (/(habit|routine)/.test(text)) return "Habits";
    if (/(identity|became|builder)/.test(text)) return "Identity";
    return "Mindset";
  }
  return "Main Career";
}

async function main() {
  const moments = await prisma.moment.findMany({
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });

  if (moments.length === 0) {
    console.log("No moments found; nothing to backfill.");
    return;
  }

  const userIds = [...new Set(moments.map((m) => m.userId))];
  const limbIds = [...new Set(moments.map((m) => m.limbId))];
  const defaultBranches = await ensureDefaultBranchesForUsers(userIds, limbIds);

  for (const moment of moments) {
    const targetBranchName = inferJourneyBranchName(moment);
    const target = await prisma.branch.findFirst({
      where: {
        userId: moment.userId,
        limbId: moment.limbId,
        OR: [{ name: targetBranchName }, { label: targetBranchName }],
      },
      select: { id: true },
    });
    const fallbackBranchId = defaultBranches.get(`${moment.userId}::${moment.limbId}`) ?? null;
    const branchId = target?.id ?? fallbackBranchId;
    if (!branchId) continue;

    const month = Number(moment.month ?? 1);
    const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
    const date = new Date(`${moment.year}-${String(safeMonth).padStart(2, "0")}-01T00:00:00.000Z`);

    await prisma.mark.upsert({
      where: { id: moment.id },
      update: {
        branchId,
        limbId: moment.limbId,
        userId: moment.userId,
        title: moment.label,
        description: moment.description ?? null,
        date,
        type: inferMarkType(moment),
        value: null,
        sentiment: inferMarkSentiment(moment),
        archived: false,
      },
      create: {
        id: moment.id,
        branchId,
        limbId: moment.limbId,
        userId: moment.userId,
        title: moment.label,
        description: moment.description ?? null,
        date,
        type: inferMarkType(moment),
        value: null,
        sentiment: inferMarkSentiment(moment),
        archived: false,
        createdAt: moment.createdAt,
        updatedAt: moment.updatedAt,
      },
    });
  }

  console.log(`Backfilled ${moments.length} moments into marks.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
