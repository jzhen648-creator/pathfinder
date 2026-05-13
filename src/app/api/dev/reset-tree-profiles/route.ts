import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedAllTreeTestProfiles } from "@/lib/tree-test-profiles-seed";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await seedAllTreeTestProfiles(prisma);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/dev/reset-tree-profiles] failed", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
