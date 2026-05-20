import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Goal evaluation is disabled." }, { status: 410 });
}
