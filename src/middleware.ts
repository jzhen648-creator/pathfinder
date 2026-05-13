import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_FILE = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|txt|webmanifest)$/i;

/**
 * Require a session for all pages except `/login`, and for `/api/*` except `/api/auth/*`.
 * Static assets under `/_next/*` and typical public file extensions are skipped via `config.matcher` + early exit.
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

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.next();
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
    /*
     * Skip Next.js internals and static files unless they hit this middleware via a broad pattern.
     * Public file extensions are released in the handler above.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
