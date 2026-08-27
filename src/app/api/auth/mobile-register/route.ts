import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AUTH_RATE_LIMITS,
  clientIpFromRequest,
  consumeAuthRateLimit,
  rateLimitedResponse,
} from "@/lib/auth-rate-limit";
import {
  buildMobileAuthResponse,
  requireAuthSecret,
  type MobileAuthResponse,
} from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { recordBetaUsageEvents } from "@/lib/telemetry/beta-usage";

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(200, "Name is too long."),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .max(254, "Email is too long."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long."),
});

/**
 * Creates an empty Almanac account and returns a mobile session immediately.
 * The first accepted AI response, not registration, creates the first Subjects.
 */
export async function POST(request: Request) {
  const secret = requireAuthSecret();
  if (typeof secret !== "string") {
    return NextResponse.json({ error: secret.error }, { status: secret.status });
  }

  const ip = clientIpFromRequest(request);
  const ipLimit = consumeAuthRateLimit(`register:ip:${ip}`, AUTH_RATE_LIMITS.register);
  if (ipLimit.limited) return rateLimitedResponse(ipLimit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        isAnonymous: false,
        onboardingCompleted: false,
      },
    });
  } catch (error) {
    // Two simultaneous requests can both pass the read before one creates the
    // account. Keep that race indistinguishable from the normal duplicate case.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    throw error;
  }

  await recordBetaUsageEvents(user.id, [{ name: "auth.register" }]).catch(() => {
    // Telemetry is never allowed to block account creation.
  });

  const response: MobileAuthResponse = await buildMobileAuthResponse(user, secret);
  return NextResponse.json(response, { status: 201 });
}
