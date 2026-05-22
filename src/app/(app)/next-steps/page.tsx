import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { buildNextStepsGoals } from "@/lib/next-steps-serialize";
import { prisma } from "@/lib/prisma";
import { NextStepsShell } from "@/components/next-steps/next-steps-shell";

export default async function NextStepsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      goals: {
        include: {
          milestones: {
            orderBy: { position: "asc" },
            include: {
              subtasks: { orderBy: { position: "asc" } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const marks = await prisma.mark.findMany({
    where: { userId, archived: false },
    orderBy: { date: "desc" },
    take: 300,
    select: { limbId: true, title: true, date: true, archived: true },
  });

  const branches = await prisma.branch.findMany({
    where: { userId, parentBranchId: null },
    orderBy: [{ limbId: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      limbId: true,
      name: true,
      label: true,
    },
  });

  const initialGoals = buildNextStepsGoals(user.goals, marks);

  return (
    <NextStepsShell
      initialGoals={initialGoals}
      initialBranches={branches}
      userName={user.name ?? ""}
      userEmail={user.email ?? ""}
    />
  );
}
