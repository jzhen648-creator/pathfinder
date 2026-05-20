import { PrismaClient } from "@prisma/client";
import { syncHubTaxonomyForUser } from "../src/lib/hub-taxonomy-sync";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "fulltree@pathfinder.test" },
    select: { id: true },
  });
  if (!user) {
    console.log("no fulltree user");
    return;
  }

  const t0 = Date.now();
  await syncHubTaxonomyForUser(prisma, user.id);
  console.log("sync ms", Date.now() - t0);

  const t1 = Date.now();
  const branches = await prisma.branch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const goals = await prisma.goal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      milestones: {
        orderBy: { position: "asc" },
        include: {
          subtasks: {
            orderBy: { position: "asc" },
            select: { id: true, isCompleted: true, position: true, title: true },
          },
        },
      },
      forkedGoals: { select: { id: true } },
    },
  });
  console.log("query ms", Date.now() - t1, "branches", branches.length, "goals", goals.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
