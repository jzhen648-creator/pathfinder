import { NextResponse } from "next/server";
import { z } from "zod";
import { eraseAlmanacForUser } from "@/lib/account-data";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import {
  almanacUserEntryCapabilityGuard,
  almanacUserEntrySafeJson,
} from "@/lib/almanac/client-capability";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { loadAlmanacAtlas } from "@/lib/almanac/service";

const eraseSchema = z.object({ confirmation: z.literal("ERASE") });

export async function GET(request: Request) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const capabilityResponse = await almanacUserEntryCapabilityGuard(request, auth.userId);
  if (capabilityResponse) return capabilityResponse;
  try {
    const body = { atlas: await loadAlmanacAtlas(auth.userId) };
    return almanacUserEntrySafeJson(request, auth.userId, body);
  } catch (error) {
    return almanacRouteError(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = eraseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Type "ERASE" to confirm.' }, { status: 400 });
  }

  try {
    await eraseAlmanacForUser(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[erase-almanac]", error);
    return NextResponse.json(
      { error: "Could not erase Almanac right now. Nothing was changed." },
      { status: 500 },
    );
  }
}
