import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$transaction([
      prisma.milestone.deleteMany({
        where: { goal: { userId } },
      }),
      prisma.goal.deleteMany({
        where: { userId },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/dev/mock-reset] failed", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
