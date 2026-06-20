import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { refreshInsightsInBackground } from "@/lib/insights/refresh-insights-background";
import { undoPursuitStreamRun } from "@/lib/stream-pursuit-capture";

type RouteProps = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await undoPursuitStreamRun(auth.userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  refreshInsightsInBackground(auth.userId);

  return NextResponse.json({ ok: true, streamRunId: id });
}
