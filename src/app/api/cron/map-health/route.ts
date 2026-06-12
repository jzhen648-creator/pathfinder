import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { summarizeMapHealthForUser } from "@/lib/map-health-summary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Weekly: aggregate map data-quality metrics (logged in Vercel Cron output). */
export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const summaries = [];
  for (const user of users) {
    summaries.push(await summarizeMapHealthForUser(prisma, user.id, user.email));
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      orphanedGoals: acc.orphanedGoals + s.orphanedGoals,
      nullShortLabels: acc.nullShortLabels + s.nullShortLabels,
      zeroDataCategories: acc.zeroDataCategories + s.zeroDataCategories,
    }),
    { orphanedGoals: 0, nullShortLabels: 0, zeroDataCategories: 0 },
  );

  return NextResponse.json({
    ok: true,
    userCount: summaries.length,
    totals,
    users: summaries,
    ts: new Date().toISOString(),
  });
}
