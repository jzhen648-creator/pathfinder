import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const pending = await prisma.streamRun.findMany({
    where: { status: "pending", expiresAt: { gt: now } },
    select: { id: true, userId: true, goalId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const userIds = [...new Set(pending.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  console.log(`Pending StreamRuns: ${pending.length}`);
  for (const run of pending) {
    console.log(
      `  ${run.id} user=${emailById.get(run.userId) ?? run.userId} goal=${run.goalId}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
