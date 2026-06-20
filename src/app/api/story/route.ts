import { NextResponse } from "next/server";

/** Story cache / seasonRead generation removed — mobile uses pursuit + theme insights only. */
export async function GET() {
  return NextResponse.json(
    { error: "Story reading generation is no longer available.", story: null, stale: true },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Story reading generation is no longer available.", story: null, stale: true },
    { status: 410 },
  );
}
