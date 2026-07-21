import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  ANONYMOUS_EMAIL_DOMAIN,
  buildMobileAuthResponse,
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

const claimSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(200, "Name is too long."),
  email: z
    .string()
    .email("Please enter a valid email address.")
    .max(254, "Email is too long."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long."),
});

/**
 * Upgrade an anonymous session into a real email/password account.
 * Keeps the same user id so map data stays attached.
 */
export async function POST(request: Request) {
  const secret = requireAuthSecret();
  if (typeof secret !== "string") {
    return NextResponse.json({ error: secret.error }, { status: secret.status });
  }

  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const ip = clientIpFromRequest(request);
  const ipLimit = consumeAuthRateLimit(`claim:ip:${ip}`, AUTH_RATE_LIMITS.register);
  if (ipLimit.limited) {
    return rateLimitedResponse(ipLimit.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email.endsWith(`@${ANONYMOUS_EMAIL_DOMAIN}`)) {
    return NextResponse.json(
      { error: "Please enter a real email address." },
      { status: 400 },
    );
  }

  const current = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!current.isAnonymous) {
    return NextResponse.json(
      { error: "This account is already saved." },
      { status: 409 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== current.id) {
    // `code` lets the client offer the merge flow instead of a dead-end.
    return NextResponse.json(
      { error: "An account with this email already exists.", code: "email_taken" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  let user;
  try {
    user = await prisma.user.update({
      where: { id: current.id },
      data: {
        name: parsed.data.name.trim(),
        email,
        passwordHash,
        isAnonymous: false,
      },
    });
  } catch (err) {
    // A concurrent registration/claim for the same email can slip past the
    // read-then-update check — return the intended 409 instead of a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists.", code: "email_taken" },
        { status: 409 },
      );
    }
    throw err;
  }

  await recordBetaUsageEvents(user.id, [{ name: "auth.claim" }]).catch(() => {
    // Non-blocking
  });

  const response: MobileAuthResponse = await buildMobileAuthResponse(user, secret);
  return NextResponse.json(response);
}
