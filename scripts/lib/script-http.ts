/**
 * NextAuth credentials login for CLI scripts hitting local API routes.
 */

export function getApiBaseUrl(): string {
  return (
    process.env.SMOKE_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

export type ScriptSession = {
  cookieHeader: string;
  email: string;
};

function cookiesFromResponse(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookieHeader(existing: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const raw of setCookies) {
    const pair = raw.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<ScriptSession> {
  const presetCookie = process.env.SMOKE_COOKIE?.trim();
  if (presetCookie) {
    return { cookieHeader: presetCookie, email };
  }

  const base = getApiBaseUrl();

  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(`GET /api/auth/csrf failed: ${csrfRes.status}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) throw new Error("Missing csrfToken from /api/auth/csrf");

  let cookieHeader = mergeCookieHeader("", cookiesFromResponse(csrfRes));

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    redirect: "false",
    json: "true",
    callbackUrl: `${base}/dashboard`,
  });

  const signInRes = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    },
    body,
    redirect: "manual",
  });
  cookieHeader = mergeCookieHeader(cookieHeader, cookiesFromResponse(signInRes));

  const signInText = await signInRes.text();
  let signInBody: { error?: string; url?: string } = {};
  try {
    signInBody = JSON.parse(signInText) as { error?: string; url?: string };
  } catch {
    /* non-JSON body */
  }
  if (signInBody.error) {
    throw new Error(`Sign-in failed: ${signInBody.error}`);
  }
  if (!signInRes.ok && signInRes.status !== 302) {
    throw new Error(
      `Sign-in HTTP ${signInRes.status}${signInText ? `: ${signInText.slice(0, 200)}` : ""} — check NEXTAUTH_SECRET and that ${base} matches NEXTAUTH_URL`,
    );
  }

  const sessionRes = await fetch(`${base}/api/auth/session`, {
    headers: { Cookie: cookieHeader },
  });
  cookieHeader = mergeCookieHeader(cookieHeader, cookiesFromResponse(sessionRes));
  const session = (await sessionRes.json()) as { user?: { email?: string } };
  if (!session.user?.email) {
    throw new Error(
      `No session after sign-in (HTTP ${signInRes.status}). Ensure the dev server is running at ${base} and credentials are valid.`,
    );
  }

  return { cookieHeader, email: session.user.email };
}

export async function apiFetch(
  session: ScriptSession,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Cookie: session.cookieHeader,
    },
  });
}

/** Follow redirects manually so the session Cookie is sent on each hop (Node fetch omits it on 308). */
export async function apiFetchFollowRedirects(
  session: ScriptSession,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getApiBaseUrl();
  let url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    ...(init?.headers ?? {}),
    Cookie: session.cookieHeader,
  };

  let res = await fetch(url, { ...init, headers, redirect: "manual" });
  for (let hop = 0; hop < 5 && res.status >= 300 && res.status < 400; hop++) {
    const location = res.headers.get("location");
    if (!location) break;
    url = new URL(location, url).href;
    res = await fetch(url, { method: "GET", headers: { Cookie: session.cookieHeader } });
  }
  return res;
}

export function defaultScriptCredentials(): { email: string; password: string } {
  return {
    email: process.env.SMOKE_EMAIL ?? "mygoals@pathfinder.test",
    password: process.env.SMOKE_PASSWORD ?? "password123",
  };
}
