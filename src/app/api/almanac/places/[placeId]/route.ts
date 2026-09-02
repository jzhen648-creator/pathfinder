import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import {
  almanacUserEntryCapabilityGuard,
  almanacUserEntrySafeJson,
} from "@/lib/almanac/client-capability";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { loadAlmanacPlace } from "@/lib/almanac/service";

type Context = { params: Promise<{ placeId: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const capabilityResponse = await almanacUserEntryCapabilityGuard(request, auth.userId);
  if (capabilityResponse) return capabilityResponse;
  const { placeId } = await context.params;
  try {
    const body = { place: await loadAlmanacPlace(auth.userId, placeId) };
    return almanacUserEntrySafeJson(request, auth.userId, body);
  } catch (error) {
    return almanacRouteError(error);
  }
}
