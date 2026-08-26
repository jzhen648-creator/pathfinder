import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { mergeAlmanacSubjectsRequestSchema } from "@/lib/almanac/contracts";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { mergeAlmanacSubjects } from "@/lib/almanac/service";

export async function POST(request: Request) {
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
  const parsed = mergeAlmanacSubjectsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Subject merge." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await mergeAlmanacSubjects(auth.userId, parsed.data));
  } catch (error) {
    return almanacRouteError(error);
  }
}
