import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { decode, getToken } from "next-auth/jwt";

async function resolveApiUserId(secret: string): Promise<string | null> {
  const hdrs = await headers();
  const auth = hdrs.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw) {
      // `decode` throws on expired/tampered/malformed tokens (unlike `getToken`,
      // which swallows errors) — treat those as unauthenticated, not a 500.
      try {
        const decoded = await decode({ token: raw, secret });
        const sub = typeof decoded?.sub === "string" ? decoded.sub.trim() : "";
        if (sub) return sub;
      } catch {
        return null;
      }
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
    // Generic body on purpose — never disclose which env var is missing.
    console.error("[api-auth] NEXTAUTH_SECRET is not set");
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server configuration error. Please try again later." },
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
