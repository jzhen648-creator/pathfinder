import { PrismaClient } from "@prisma/client";
import { LOCKED_CATEGORY_TEMPLATES } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

const BRANCH_TEMPLATES = LOCKED_CATEGORY_TEMPLATES.map((t, order) => ({
  limbId: t.limbId,
  name: t.threadType,
  order,
}));

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
        const existingByName = await prisma.themeCategory.findFirst({
          where: { userId, limbId, OR: [{ name: template.name }, { label: template.name }] },
          select: { id: true },
        });
        if (existingByName) continue;
        await prisma.themeCategory.create({
          data: {
            userId,
            limbId,
            label: template.name,
            name: template.name,
            status: "active",
            order: template.order,
            mapAngleOffset: 0,
            parentCategoryId: null,
            turningPointId: null,
          },
        });
      }
      const primary = await prisma.themeCategory.findFirst({
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
  themeId: string;
  title?: string | null;
  description?: string | null;
}): string {
  const text = `${g.title ?? ""} ${g.description ?? ""}`.toLowerCase();
  if (g.themeId === "finance") {
    if (/(debt|loan|paid off|mortgage|credit)/.test(text)) return "Debts & loans";
    if (/(rent|rental|landlord|tenant|btl|buy-to-let|airbnb|hmo)/.test(text)) return "Property income";
    if (/(freelance|self[- ]?employed|sole trader|invoic|side business|consulting client)/.test(text)) {
      return "Business & freelance";
    }
    if (/(salary|payroll|bonus|commission|employer)/.test(text)) return "Pay from work";
    if (/(insurance|emergency|runway|safety)/.test(text)) return "Safety net & insurance";
    return "Assets & investing";
  }
  if (g.themeId === "work") {
    if (/(cemap|cert|qualification|license|licence|exam)/.test(text)) return "Qualifications";
    if (/(mentor|network|collaborat|peer|skill|learn|course|speaking|toastmasters)/.test(text)) {
      return "Education & courses";
    }
    if (/(project|ship|build|portfolio)/.test(text)) return "Projects & launches";
    if (/(interview|job search|apply|recruiter|hunt)/.test(text)) return "Career search";
    return "Jobs & roles";
  }
  if (g.themeId === "people") {
    if (/(dad|mum|family|parent|child)/.test(text)) return "Family";
    if (/(engag|partner|romance|marri)/.test(text)) return "Partner & romance";
    if (/(volunteer|community|local group|neighbour|friend)/.test(text)) return "Friends & community";
    return "Friends & community";
  }
  if (g.themeId === "health") {
    if (/(burnout|sleep|rest|recovery|downtime)/.test(text)) return "Rest & recovery";
    if (/(meal|nutrition|eat|food)/.test(text)) return "Food & nutrition";
    if (/(teeth|hair|skin|invisalign|cosmetic|upgrade)/.test(text)) return "Body care";
    return "Training & sport";
  }
  if (g.themeId === "becoming") {
    if (/(habit|routine|ritual|therapy|journal|reflect|pattern|identity)/.test(text)) return "Mind & wellbeing";
    return "Values & direction";
  }
  if (g.themeId === "pleasures") {
    if (/(read|book|film|music|culture|watch|listen)/.test(text)) return "Books, film & culture";
    if (/(trip|travel|festival|event|holiday)/.test(text)) return "Trips & events";
    return "Hobbies & making";
  }
  return "Jobs & roles";
}

async function main() {
  const timelineGoals = await prisma.goal.findMany({
    where: { goalType: { in: ["moment", "event"] }, themeId: { not: null } },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });

  if (timelineGoals.length === 0) {
    console.log("No timeline goals (moment/event) found; nothing to backfill.");
    return;
  }

  const userIds = [...new Set(timelineGoals.map((g) => g.userId))];
  const limbIds = [...new Set(timelineGoals.map((g) => g.themeId).filter((id): id is string => id != null))];
  const defaultBranches = await ensureDefaultBranchesForUsers(userIds, limbIds);

  for (const g of timelineGoals) {
    const limbId = g.themeId;
    if (limbId == null) continue;
    const targetBranchName = inferJourneyBranchName({ limbId, title: g.title, description: g.description });
    const target = await prisma.themeCategory.findFirst({
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
