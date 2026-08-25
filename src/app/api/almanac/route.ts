import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { loadAlmanacAtlas } from "@/lib/almanac/service";

export async function GET() {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  try {
    return NextResponse.json({ atlas: await loadAlmanacAtlas(auth.userId) });
  } catch (error) {
    return almanacRouteError(error);
  }
}
