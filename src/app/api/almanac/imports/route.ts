import { NextResponse } from "next/server";
import { requireAlmanacDogfoodUser } from "@/lib/almanac/auth";
import { commitAlmanacImportRequestSchema } from "@/lib/almanac/contracts";
import { almanacDogfoodEnabled } from "@/lib/almanac/feature";
import { almanacRouteError } from "@/lib/almanac/route-response";
import { commitAlmanacImport } from "@/lib/almanac/service";

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
  const parsed = commitAlmanacImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Import request." },
      { status: 400 },
    );
  }
  try {
    const result = await commitAlmanacImport(auth.userId, parsed.data);
    return NextResponse.json(result, { status: result.disposition === "created" ? 201 : 200 });
  } catch (error) {
    return almanacRouteError(error);
  }
}
