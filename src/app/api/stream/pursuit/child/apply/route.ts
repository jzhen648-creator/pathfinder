import { NextResponse } from "next/server";

/** Retired — child pursuits are peers on create; nest via edit-map drag only. */
export async function POST() {
  return NextResponse.json(
    { error: "Child pursuit composer removed. Add a pursuit on the track, then drag-to-nest in edit map." },
    { status: 410 },
  );
}
