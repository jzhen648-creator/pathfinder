import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { loadAlmanacPlace } from "@/lib/almanac/service";

type Context = { params: Promise<{ placeId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const { placeId } = await context.params;
  try {
    return NextResponse.json({ place: await loadAlmanacPlace(auth.userId, placeId) });
  } catch (error) {
    return almanacRouteError(error);
  }
}
