import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily: remove expired pending StreamRun rows (TTL passed, never applied). */
export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await prisma.streamRun.deleteMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
  });

  return NextResponse.json({
    ok: true,
    deleted: result.count,
    ts: now.toISOString(),
  });
}
