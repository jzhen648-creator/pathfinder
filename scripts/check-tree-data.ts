import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!user) {
    console.log("no users");
    return;
  }
  console.log("user", user.email);

  const branches = await prisma.themeCategory.findMany({
    where: { userId: user.id, parentCategoryId: null },
    select: { id: true, limbId: true, label: true, isActive: true, status: true },
  });
  const active = branches.filter((b) => b.isActive);
  console.log("root branches", branches.length, "active", active.length);

  const goals = await prisma.goal.findMany({
    where: { userId: user.id },
    select: { id: true, status: true, categoryId: true },
    take: 5,
  });
  console.log("goals sample", goals);

  const marks = await prisma.mark.count({ where: { userId: user.id } });
  console.log("marks", marks);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
