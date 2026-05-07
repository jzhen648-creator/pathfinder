import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/api/marks", request.url), 308);
}

export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/api/marks", request.url), 308);
}
