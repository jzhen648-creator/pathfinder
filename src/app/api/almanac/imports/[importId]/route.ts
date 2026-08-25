import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { loadAlmanacImport } from "@/lib/almanac/service";

type Context = { params: Promise<{ importId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const { importId } = await context.params;
  try {
    return NextResponse.json({ import: await loadAlmanacImport(auth.userId, importId) });
  } catch (error) {
    return almanacRouteError(error);
  }
}
