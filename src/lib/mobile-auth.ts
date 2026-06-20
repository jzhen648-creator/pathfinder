/**
 * Mobile auth helpers — sign a NextAuth-compatible session JWT that downstream
 * `getServerSession(authOptions)` can read once middleware injects it as a cookie.
 *
 * Used by `/api/auth/mobile-login` and `/api/auth/mobile-register`. The token
 * shape mirrors what NextAuth's own `jwt` callback writes in `src/lib/auth.ts`
 * so cookie-mode and bearer-mode are interchangeable.
 */
import { encode } from "next-auth/jwt";

export const MOBILE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type MobileAuthUser = {
  id: string;
  name: string | null;
  email: string;
  onboardingCompleted: boolean;
};

export type MobileAuthResponse = {
  token: string;
  user: MobileAuthUser;
};

export async function signMobileSessionJwt(
  user: MobileAuthUser,
  secret: string,
): Promise<string> {
  return encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      onboardingCompleted: user.onboardingCompleted,
    },
    secret,
    maxAge: MOBILE_SESSION_MAX_AGE_SECONDS,
  });
}

export function requireAuthSecret(): string | { error: string; status: number } {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return {
      error: "Server misconfigured: NEXTAUTH_SECRET is not set.",
      status: 500,
    };
  }
  return secret;
}
