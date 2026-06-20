import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

/** Stream extract retired — use map ai-sync reflect path instead. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Stream extract is no longer available. Use map ai-sync instead." },
    { status: 410 },
  );
}
