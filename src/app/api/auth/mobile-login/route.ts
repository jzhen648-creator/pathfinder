import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildMobileAuthResponse,
  DUMMY_BCRYPT_HASH,
  requireAuthSecret,
  type MobileAuthResponse,
} from "@/lib/mobile-auth";
import { recordBetaUsageEvents } from "@/lib/telemetry/beta-usage";
import {
  AUTH_RATE_LIMITS,
  clientIpFromRequest,
  consumeAuthRateLimit,
  rateLimitedResponse,
} from "@/lib/auth-rate-limit";

const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address.")
    .max(254, "Email is too long."),
  password: z.string().min(1, "Password is required.").max(128, "Password is too long."),
});

/**
 * Mobile-only login. Validates email/password against the same Prisma `User`
 * the web `CredentialsProvider` uses, then returns a NextAuth-compatible
 * session JWT for the mobile client to store in `expo-secure-store`.
 *
 * The token is interchangeable with NextAuth's cookie-mode session token —
 * middleware injects it as `next-auth.session-token` / `__Secure-next-auth.session-token`
 * on every `/api/*` request so `getServerSession(authOptions)` works unchanged.
 */
export async function POST(request: Request) {
  const secret = requireAuthSecret();
  if (typeof secret !== "string") {
    return NextResponse.json({ error: secret.error }, { status: secret.status });
  }

  const ip = clientIpFromRequest(request);
  const ipLimit = consumeAuthRateLimit(`login:ip:${ip}`, AUTH_RATE_LIMITS.login);
  if (ipLimit.limited) {
    return rateLimitedResponse(ipLimit.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailLimit = consumeAuthRateLimit(`login:email:${email}`, AUTH_RATE_LIMITS.login);
  if (emailLimit.limited) {
    return rateLimitedResponse(emailLimit.retryAfterSeconds);
  }

  // Fallback lookup with the raw casing covers accounts registered before
  // email normalization landed.
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (parsed.data.email.trim() !== email
      ? await prisma.user.findUnique({ where: { email: parsed.data.email.trim() } })
      : null);
  if (!user || !user.passwordHash || user.isAnonymous) {
    // Equalize timing with the wrong-password path so response time doesn't
    // reveal whether the email has an account.
    await bcrypt.compare(parsed.data.password, DUMMY_BCRYPT_HASH);
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  await recordBetaUsageEvents(user.id, [{ name: "auth.login" }]).catch(() => {
    // Non-blocking
  });

  const response: MobileAuthResponse = await buildMobileAuthResponse(user, secret);
  return NextResponse.json(response);
}
