import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Goal chat is disabled." }, { status: 410 });
}
