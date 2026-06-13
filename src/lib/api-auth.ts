import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { decode, getToken } from "next-auth/jwt";

async function resolveApiUserId(secret: string): Promise<string | null> {
  const hdrs = await headers();
  const auth = hdrs.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw) {
      const decoded = await decode({ token: raw, secret });
      const sub = typeof decoded?.sub === "string" ? decoded.sub.trim() : "";
      if (sub) return sub;
    }
  }

  const cookie = hdrs.get("cookie") ?? "";
  const sessionToken = await getToken({
    req: { headers: { cookie } } as Parameters<typeof getToken>[0]["req"],
    secret,
  });
  const sub = typeof sessionToken?.sub === "string" ? sessionToken.sub.trim() : "";
  return sub || null;
}

/**
 * Resolves the authenticated user for API routes.
 * Bearer JWT (mobile) and session cookies (web) both work.
 */
export async function requireApiSessionUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server misconfigured: NEXTAUTH_SECRET is not set." },
        { status: 500 },
      ),
    };
  }

  const userId = await resolveApiUserId(secret);
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, userId };
}
