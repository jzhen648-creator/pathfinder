import { NextResponse } from "next/server";

function redirectToMoments(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/marks";
  return NextResponse.redirect(url, 308);
}

export async function GET(request: Request) {
  return redirectToMoments(request);
}

export async function POST(request: Request) {
  return redirectToMoments(request);
}
