import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { getPursuitStreamRun } from "@/lib/stream-pursuit-apply";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const run = await getPursuitStreamRun(auth.userId, id);
  if (!run) {
    return NextResponse.json({ error: "Stream run not found or expired" }, { status: 404 });
  }

  return NextResponse.json(run);
}
