import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_FILE = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|txt|webmanifest)$/i;

const LOGIN_PATHS = ["/login"];
const ONBOARDING_PATH = "/onboarding";

function isLoginPath(pathname: string): boolean {
  return LOGIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Require a session for all pages except `/login`, and for `/api/*` except `/api/auth/*`.
 * Incomplete onboarding → `/onboarding`; completed users cannot revisit onboarding.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("[middleware] NEXTAUTH_SECRET is not set");
  }

  const token = await getToken({ req, secret });

  if (pathname.startsWith("/api/")) {
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isLoginPath(pathname)) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === "development" && pathname.startsWith("/dev/")) {
    return NextResponse.next();
  }

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // Dev uses a pinned session user; JWT can be stale until re-login. Server pages gate
  // onboarding — skipping middleware onboarding redirects avoids /tree ↔ /onboarding loops.
  const skipOnboardingRedirects = process.env.NODE_ENV === "development";

  if (!skipOnboardingRedirects) {
    const onboardingCompleted = token.onboardingCompleted === true;

    if (!onboardingCompleted && pathname !== ONBOARDING_PATH) {
      const url = req.nextUrl.clone();
      url.pathname = ONBOARDING_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (onboardingCompleted && pathname === ONBOARDING_PATH) {
      const url = req.nextUrl.clone();
      url.pathname = "/tree";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
