import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import {
  almanacUserEntryCapabilityGuard,
  almanacUserEntrySafeJson,
} from "@/lib/almanac/client-capability";
import { updateAlmanacSubjectRequestSchema } from "@/lib/almanac/contracts";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { updateAlmanacSubject } from "@/lib/almanac/service";

type Context = { params: Promise<{ subjectId: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const capabilityResponse = await almanacUserEntryCapabilityGuard(request, auth.userId);
  if (capabilityResponse) return capabilityResponse;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = updateAlmanacSubjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Subject change." },
      { status: 400 },
    );
  }
  const { subjectId } = await context.params;
  try {
    const result = await updateAlmanacSubject(auth.userId, subjectId, parsed.data);
    return almanacUserEntrySafeJson(request, auth.userId, result);
  } catch (error) {
    return almanacRouteError(error);
  }
}
