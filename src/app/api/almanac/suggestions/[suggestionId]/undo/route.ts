import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { almanacPersistentSuggestionsCapabilityGuard } from "@/lib/almanac/client-capability";
import { undoAlmanacSuggestionAcceptanceRequestSchema } from "@/lib/almanac/contracts";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { undoAlmanacSuggestionAcceptance } from "@/lib/almanac/suggestion-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ suggestionId: string }> },
) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const capabilityResponse = almanacPersistentSuggestionsCapabilityGuard(request);
  if (capabilityResponse) return capabilityResponse;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = undoAlmanacSuggestionAcceptanceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Undo request." },
      { status: 400 },
    );
  }
  try {
    const { suggestionId } = await context.params;
    return NextResponse.json(
      await undoAlmanacSuggestionAcceptance(auth.userId, suggestionId, parsed.data),
    );
  } catch (error) {
    return almanacRouteError(error);
  }
}
