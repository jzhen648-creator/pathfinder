import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { almanacPersistentSuggestionsCapabilityGuard } from "@/lib/almanac/client-capability";
import { stageAlmanacSuggestionsRequestSchema } from "@/lib/almanac/contracts";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import {
  listAlmanacSuggestions,
  stageAlmanacSuggestions,
} from "@/lib/almanac/suggestion-service";

async function preflight(request: Request) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return { response: auth.response } as const;
  if (!almanacDogfoodEnabled()) {
    return { response: NextResponse.json(
      { error: "Almanac dogfood is not enabled." },
      { status: 503 },
    ) } as const;
  }
  const capabilityResponse = almanacPersistentSuggestionsCapabilityGuard(request);
  return capabilityResponse
    ? { response: capabilityResponse } as const
    : { userId: auth.userId } as const;
}

export async function GET(request: Request) {
  const access = await preflight(request);
  if ("response" in access) return access.response;
  try {
    return NextResponse.json(await listAlmanacSuggestions(access.userId));
  } catch (error) {
    return almanacRouteError(error);
  }
}

export async function POST(request: Request) {
  const access = await preflight(request);
  if ("response" in access) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = stageAlmanacSuggestionsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Suggestion source." },
      { status: 400 },
    );
  }
  try {
    const result = await stageAlmanacSuggestions(access.userId, parsed.data);
    return NextResponse.json(result, {
      status: result.disposition === "created" ? 201 : 200,
    });
  } catch (error) {
    return almanacRouteError(error);
  }
}
