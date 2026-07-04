import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { recordBetaUsageEvents } from "@/lib/telemetry/beta-usage";

const eventSchema = z.object({
  name: z.string().min(1).max(64),
  props: z.record(z.string(), z.unknown()).optional(),
  at: z.string().datetime().optional(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

/**
 * Batch ingest for TestFlight friends-and-family usage telemetry.
 * Authenticated mobile clients only; events are stored per user in Postgres.
 */
export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    const count = await recordBetaUsageEvents(
      auth.userId,
      parsed.data.events.map((event) => ({
        name: event.name,
        props: event.props,
        at: event.at ? new Date(event.at) : undefined,
      })),
    );
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record events";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
