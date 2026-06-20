import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDesktopLegacyWebPath, isProductionWeb, WEB_HOME_PATH } from "@/lib/web-landing";

const PUBLIC_FILE = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|txt|webmanifest)$/i;

/** Expo web (localhost:8081) and LAN dev clients call /api cross-origin. */
const CORS_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;

function isAllowedCorsOrigin(origin: string | null): boolean {
  return Boolean(origin && CORS_ORIGIN_PATTERN.test(origin));
}

function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin");
  if (!isAllowedCorsOrigin(origin) || !origin) return res;
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.append("Vary", "Origin");
  return res;
}

function finishApi(req: NextRequest, res: NextResponse): NextResponse {
  return withCors(req, res);
}

const LOGIN_PATHS = ["/login"];
const PUBLIC_PATHS = ["/reset-password", "/privacy", WEB_HOME_PATH];

const PUBLIC_API_PATHS = ["/api/health"];

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
function withBearerCookieForwarded(req: NextRequest): NextResponse {
  const authHeader = req.headers.get("authorization");
  const raw =
    authHeader?.toLowerCase().startsWith("bearer ") === true ? authHeader.slice(7).trim() : "";
  if (!raw) return NextResponse.next();

  const isHttps = req.nextUrl.protocol === "https:";
  const cookieName = isHttps
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const requestHeaders = new Headers(req.headers);
  const existingCookie = req.headers.get("cookie") ?? "";
  const stripped = existingCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${cookieName}=`))
    .join("; ");
  const merged = stripped ? `${stripped}; ${cookieName}=${raw}` : `${cookieName}=${raw}`;
  requestHeaders.set("cookie", merged);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Require a session for all pages except `/login`, and for `/api/*` except `/api/auth/*`.
 * Incomplete onboarding → `/onboarding`; completed users cannot revisit onboarding.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  if (isApi && req.method === "OPTIONS") {
    return finishApi(req, new NextResponse(null, { status: 204 }));
  }

  if (pathname.startsWith("/api/auth")) {
    return finishApi(req, NextResponse.next());
  }

  if (PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return finishApi(req, NextResponse.next());
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("[middleware] NEXTAUTH_SECRET is not set");
  }

  const token = await getToken({ req, secret });

  if (pathname.startsWith("/api/")) {
    if (!token) {
      return finishApi(req, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    return finishApi(req, withBearerCookieForwarded(req));
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

  if (isProductionWeb() && isDesktopLegacyWebPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = WEB_HOME_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
