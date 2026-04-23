type RouteProps = {
  params: Promise<{ goalId: string }>;
};
import { NextResponse } from "next/server";

async function redirectToMoment(request: Request, props: RouteProps) {
  const { goalId } = await props.params;
  const url = new URL(request.url);
  url.pathname = `/api/moments/${goalId}`;
  return NextResponse.redirect(url, 308);
}

export async function PATCH(request: Request, props: RouteProps) {
  return redirectToMoment(request, props);
}

export async function DELETE(request: Request, props: RouteProps) {
  return redirectToMoment(request, props);
}
