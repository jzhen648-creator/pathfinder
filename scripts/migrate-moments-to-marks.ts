import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const timelineGoals = await prisma.goal.findMany({
    where: { goalType: { in: ["moment", "event"] } },
    orderBy: { createdAt: "asc" },
  });
  const totalMoments = timelineGoals.length;
  let created = 0;
  let skipped = 0;

  for (const g of timelineGoals) {
    if (!g.categoryId || !g.limbId) {
      skipped += 1;
      continue;
    }
    const existing = await prisma.mark.findFirst({
      where: { categoryId: g.categoryId, title: g.title },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const month0Based = (g.month ?? 1) - 1;
    const date = new Date(g.year, month0Based, 1);

    await prisma.mark.create({
      data: {
        title: g.title,
        description: g.description || null,
        date,
        significance: g.significance,
        future: g.future,
        isTurningPoint: g.isTurningPoint,
        parentMarkId: null,
        location: g.location,
        timelineNote: g.timelineNote,
        subtype: g.subtype,
        year: g.year,
        month: g.month,
        limbId: g.limbId,
        categoryId: g.categoryId,
        userId: g.userId,
        sentiment: "neutral",
        archived: false,
      },
    });
    created += 1;
  }

  console.log(`Timeline goals (moment/event) found: ${totalMoments}`);
  console.log(`Marks created: ${created}`);
  console.log(`Skipped (mark already exists for branch + title): ${skipped}`);
}

main()
  .catch((err) => {
    console.error("migrate-moments-to-marks failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
