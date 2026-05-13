import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ users: [] });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { email: { contains: "@pathfinder.test" } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    users: users.map((user, index) => ({
      id: user.id,
      /** Short labels in the tree dev picker (1, 2, … by creation order). */
      name: String(index + 1),
      email: user.email,
    })),
  });
}
