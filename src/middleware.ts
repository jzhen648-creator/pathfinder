import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_FILE = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|txt|webmanifest)$/i;

const LOGIN_PATHS = ["/login"];
const PUBLIC_PATHS = ["/reset-password"];
const ONBOARDING_PATH = "/onboarding";
const TREE_PATH = "/tree";

function isLoginPath(pathname: string): boolean {
  return LOGIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Mobile clients send the NextAuth session JWT as `Authorization: Bearer <jwt>`.
 * `getToken({ req })` already accepts it for the middleware-level auth check,
 * but downstream route handlers that call `getServerSession(authOptions)` read
 * from cookies only. We forward the request with the bearer token re-attached
 * as the cookie NextAuth would have set itself — one place, every API route works.
 */
function withBearerCookieForwarded(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;

  const raw = authHeader.slice(7).trim();
  if (!raw) return null;

  const isHttps = req.nextUrl.protocol === "https:";
  const cookieName = isHttps
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const existingCookie = req.headers.get("cookie") ?? "";
  if (existingCookie.includes(`${cookieName}=`)) return null;

  const requestHeaders = new Headers(req.headers);
  const merged = existingCookie
    ? `${existingCookie}; ${cookieName}=${raw}`
    : `${cookieName}=${raw}`;
  requestHeaders.set("cookie", merged);

  return NextResponse.next({ request: { headers: requestHeaders } });
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
    return withBearerCookieForwarded(req) ?? NextResponse.next();
  }

  if (isLoginPath(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
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

    if (!onboardingCompleted && pathname !== TREE_PATH && pathname !== ONBOARDING_PATH) {
      const url = req.nextUrl.clone();
      url.pathname = TREE_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (onboardingCompleted && pathname === ONBOARDING_PATH) {
      const url = req.nextUrl.clone();
      url.pathname = TREE_PATH;
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
