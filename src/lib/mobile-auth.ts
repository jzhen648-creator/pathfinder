/**
 * Mobile auth helpers — sign a NextAuth-compatible session JWT that downstream
 * `getServerSession(authOptions)` can read once middleware injects it as a cookie.
 *
 * Used by `/api/auth/mobile-login`, `mobile-register`, `mobile-anonymous`, and
 * `mobile-claim`. The token shape mirrors what NextAuth's own `jwt` callback
 * writes in `src/lib/auth.ts` so cookie-mode and bearer-mode are interchangeable.
 */
import { encode } from "next-auth/jwt";

export const MOBILE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Placeholder domain for anonymous accounts — never a real mailbox. */
export const ANONYMOUS_EMAIL_DOMAIN = "anonymous.invalid";

/**
 * Cost-12 hash of a throwaway string. Compared against when the email has no
 * account so unknown-email and wrong-password responses take the same time
 * (prevents account enumeration via response timing).
 */
export const DUMMY_BCRYPT_HASH =
  "$2b$12$i7bZQjGQYX0w.btLM.u2ZuGUgpZEq35EZ0zuNd.Y81HxfnX2zbB66";

export type MobileAuthUser = {
  id: string;
  name: string | null;
  email: string;
  onboardingCompleted: boolean;
  isAnonymous: boolean;
};

export type MobileAuthResponse = {
  token: string;
  user: MobileAuthUser;
};

export function anonymousPlaceholderEmail(unique: string): string {
  return `anon-${unique}@${ANONYMOUS_EMAIL_DOMAIN}`;
}

export function toMobileAuthUser(user: {
  id: string;
  name: string | null;
  email: string;
  onboardingCompleted: boolean;
  isAnonymous?: boolean | null;
}): MobileAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    onboardingCompleted: user.onboardingCompleted,
    isAnonymous: user.isAnonymous === true,
  };
}

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
      isAnonymous: user.isAnonymous,
    },
    secret,
    maxAge: MOBILE_SESSION_MAX_AGE_SECONDS,
  });
}

export async function buildMobileAuthResponse(
  user: {
    id: string;
    name: string | null;
    email: string;
    onboardingCompleted: boolean;
    isAnonymous?: boolean | null;
  },
  secret: string,
): Promise<MobileAuthResponse> {
  const mobileUser = toMobileAuthUser(user);
  const token = await signMobileSessionJwt(mobileUser, secret);
  return { token, user: mobileUser };
}

export function requireAuthSecret(): string | { error: string; status: number } {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Generic body on purpose — never disclose which env var / auth stack
    // detail is missing to unauthenticated callers. Log for operators.
    console.error("[mobile-auth] NEXTAUTH_SECRET is not set");
    return {
      error: "Server configuration error. Please try again later.",
      status: 500,
    };
  }
  return secret;
}
