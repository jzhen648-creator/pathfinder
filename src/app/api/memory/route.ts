import { NextResponse } from "next/server";

import { requireApiSessionUserId } from "@/lib/api-auth";

/** Retired — UserMemory pipeline removed; table retained for future AI fact layer. */
export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { error: "Profile memory API retired." },
    { status: 410 },
  );
}

export async function PATCH() {
  return GET();
}
