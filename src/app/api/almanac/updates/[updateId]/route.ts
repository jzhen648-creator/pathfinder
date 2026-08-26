import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { updateAlmanacUpdatePreferenceRequestSchema } from "@/lib/almanac/contracts";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { updateAlmanacUpdatePreference } from "@/lib/almanac/service";

type Context = { params: Promise<{ updateId: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await requireAlmanacDogfoodUser();
  if (!auth.ok) return auth.response;
  if (!almanacDogfoodEnabled()) {
    return NextResponse.json({ error: "Almanac dogfood is not enabled." }, { status: 503 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = updateAlmanacUpdatePreferenceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Update change." },
      { status: 400 },
    );
  }
  const { updateId } = await context.params;
  try {
    return NextResponse.json(await updateAlmanacUpdatePreference(auth.userId, updateId, parsed.data));
  } catch (error) {
    return almanacRouteError(error);
  }
}
