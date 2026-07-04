import { NextResponse } from "next/server";

import { requireApiSessionUserId } from "@/lib/api-auth";

/** Retired — UserMemory pipeline removed; table retained for future AI fact layer. */
export async function POST() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { error: "Profile memory update API retired." },
    { status: 410 },
  );
}
