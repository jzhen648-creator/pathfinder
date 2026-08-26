import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { unmergeAlmanacSubject } from "@/lib/almanac/service";

type Context = { params: Promise<{ subjectId: string }> };

export async function POST(_request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  const { subjectId } = await context.params;
  try {
    return NextResponse.json(await unmergeAlmanacSubject(auth.userId, subjectId));
  } catch (error) {
    return almanacRouteError(error);
  }
}
