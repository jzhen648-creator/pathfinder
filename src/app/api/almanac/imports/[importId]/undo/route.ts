import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import {
  almanacUserEntryCapabilityGuard,
  almanacUserEntrySafeJson,
} from "@/lib/almanac/client-capability";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { undoAlmanacImport } from "@/lib/almanac/service";

type Context = { params: Promise<{ importId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const capabilityResponse = await almanacUserEntryCapabilityGuard(request, auth.userId);
  if (capabilityResponse) return capabilityResponse;
  const { importId } = await context.params;
  try {
    const result = await undoAlmanacImport(auth.userId, importId);
    return almanacUserEntrySafeJson(request, auth.userId, result);
  } catch (error) {
    return almanacRouteError(error);
  }
}
